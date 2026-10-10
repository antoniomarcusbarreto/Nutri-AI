-- ============================================================================
-- Migration 0035 — Agenda online v2: bloqueios, duração variável, intervalo
-- ============================================================================
--
-- Regras de negócio (decididas pelo dono do produto, 2026-10-10):
--   * Cada consulta tem a própria duração (appointments.duration_minutes);
--     vazio = duração do serviço. O pedido do paciente reserva a duração
--     padrão e o nutricionista ajusta ao aceitar (ou ao sugerir outra data).
--   * Bloqueios dentro da grade: semanais ("toda segunda 14:00–15:30"), numa
--     data com horário, ou dia inteiro/período (o que já existia).
--   * Regras por nutricionista: intervalo mínimo entre consultas, passo dos
--     horários oferecidos, antecedência mínima e limite de dias à frente.
--   * A equipe recebe AVISO de conflito ao agendar pela Agenda, mas pode
--     encaixar mesmo assim. O paciente só vê horários sem conflito nenhum.
--   * Avisos por e-mail (Edge Function `schedule-notify`) registram o que já
--     foi enviado em appointment_change_requests.notified.
--
-- Fuso: horários locais de America/Sao_Paulo.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Duração real por consulta e por pedido
-- ----------------------------------------------------------------------------
alter table public.appointments
    add column if not exists duration_minutes int check (duration_minutes is null or duration_minutes between 10 and 600);

alter table public.appointment_change_requests
    add column if not exists duration_minutes int check (duration_minutes is null or duration_minutes between 10 and 600),
    add column if not exists notified jsonb not null default '{}'::jsonb;

update public.appointment_change_requests r
set duration_minutes = coalesce((select nullif(s.duration_minutes, 0) from public.services s where s.id = r.service_id), 60)
where r.duration_minutes is null and r.kind in ('reschedule', 'booking');

-- ----------------------------------------------------------------------------
-- 2. Bloqueios (amplia nutritionist_time_off)
-- ----------------------------------------------------------------------------
alter table public.nutritionist_time_off
    alter column starts_on drop not null,
    alter column ends_on drop not null,
    add column if not exists weekday    smallint,
    add column if not exists start_time time,
    add column if not exists end_time   time;

alter table public.nutritionist_time_off drop constraint if exists nutritionist_time_off_shape;
alter table public.nutritionist_time_off add constraint nutritionist_time_off_shape check (
    -- Dia inteiro / período, ou uma data com faixa de horário
    (weekday is null and starts_on is not null and ends_on is not null and ends_on >= starts_on
     and ((start_time is null and end_time is null)
          or (start_time is not null and end_time is not null and end_time > start_time and starts_on = ends_on)))
    or
    -- Toda semana, com validade opcional
    (weekday is not null and weekday between 0 and 6
     and start_time is not null and end_time is not null and end_time > start_time
     and (starts_on is null or ends_on is null or ends_on >= starts_on))
);

-- ----------------------------------------------------------------------------
-- 3. Regras da agenda por nutricionista
-- ----------------------------------------------------------------------------
create table if not exists public.nutritionist_schedule_settings (
    nutritionist_id   uuid primary key references public.profiles(id) on delete cascade,
    clinic_id         uuid not null references public.clinics(id) on delete cascade,
    buffer_minutes    int not null default 0  check (buffer_minutes between 0 and 120),
    slot_step_minutes int not null default 30 check (slot_step_minutes in (10, 15, 20, 30, 45, 60)),
    min_notice_hours  int not null default 12 check (min_notice_hours between 0 and 336),
    max_days_ahead    int not null default 60 check (max_days_ahead between 1 and 365),
    updated_at        timestamptz not null default now()
);
alter table public.nutritionist_schedule_settings enable row level security;

drop policy if exists nutritionist_schedule_settings_team_select on public.nutritionist_schedule_settings;
drop policy if exists nutritionist_schedule_settings_own_write   on public.nutritionist_schedule_settings;
create policy nutritionist_schedule_settings_team_select on public.nutritionist_schedule_settings for select to authenticated
    using (public.acting_member_of(clinic_id));
create policy nutritionist_schedule_settings_own_write on public.nutritionist_schedule_settings for all to authenticated
    using (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']))
    with check (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

-- Regras vigentes (padrões quando o nutricionista não configurou).
create or replace function public._schedule_settings(p_nutritionist_id uuid)
returns public.nutritionist_schedule_settings
language sql stable security definer set search_path = public
as $$
    select coalesce(
        (select s from public.nutritionist_schedule_settings s where s.nutritionist_id = p_nutritionist_id),
        row(p_nutritionist_id, null, 0, 30, 12, 60, now())::public.nutritionist_schedule_settings
    );
$$;

-- ----------------------------------------------------------------------------
-- 4. Durações e conflitos (internos)
-- ----------------------------------------------------------------------------
create or replace function public._appointment_minutes(p_duration int, p_service_id uuid)
returns int language sql stable security definer set search_path = public
as $$
    select coalesce(nullif(p_duration, 0), public._service_minutes(p_service_id));
$$;

-- Bloqueio que cobre [p_start, p_start + p_minutes)?
create or replace function public._is_blocked(p_nutritionist_id uuid, p_start timestamptz, p_minutes int)
returns boolean language sql stable security definer set search_path = public
as $$
    with t0 as (
        select (p_start at time zone 'America/Sao_Paulo') as ls,
               (p_start at time zone 'America/Sao_Paulo') + make_interval(mins => p_minutes) as le
    )
    select exists (
        select 1 from public.nutritionist_time_off t, t0
        where t.nutritionist_id = p_nutritionist_id
          and (
              -- dia inteiro / período
              (t.weekday is null and t.start_time is null
               and t0.ls::date <= t.ends_on and t0.le::date >= t.starts_on)
              or
              -- uma data com horário
              (t.weekday is null and t.start_time is not null
               and t0.ls::date = t.starts_on
               and t0.ls::time < t.end_time and t0.le::time > t.start_time)
              or
              -- toda semana
              (t.weekday is not null
               and t.weekday = extract(dow from t0.ls)::int
               and (t.starts_on is null or t0.ls::date >= t.starts_on)
               and (t.ends_on is null or t0.ls::date <= t.ends_on)
               and t0.ls::time < t.end_time and t0.le::time > t.start_time)
          )
    );
$$;

-- Conflito "duro" (consulta ou pedido em aberto), contando o intervalo do
-- nutricionista dos dois lados. Devolve 'consulta', 'pedido' ou null.
create or replace function public._slot_hard_conflict(
    p_nutritionist_id uuid, p_start timestamptz, p_minutes int,
    p_exclude_appointment uuid, p_exclude_request uuid
)
returns text language sql stable security definer set search_path = public
as $$
    with cfg as (select (public._schedule_settings(p_nutritionist_id)).buffer_minutes as b),
    win as (
        select tstzrange(p_start, p_start + make_interval(mins => p_minutes + cfg.b)) as r, cfg.b from cfg
    )
    select case
        when exists (
            select 1 from public.appointments a, win
            where a.nutritionist_id = p_nutritionist_id
              and a.status <> 'cancelado'
              and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
              and tstzrange(a.date_time, a.date_time + make_interval(mins => public._appointment_minutes(a.duration_minutes, a.service_id) + win.b)) && win.r
        ) then 'consulta'
        when exists (
            select 1 from public.appointment_change_requests q, win
            where q.nutritionist_id = p_nutritionist_id
              and q.kind in ('reschedule', 'booking')
              and q.status in ('pendente', 'proposto')
              and (p_exclude_request is null or q.id <> p_exclude_request)
              and (p_exclude_appointment is null or q.appointment_id is distinct from p_exclude_appointment)
              and (case when q.status = 'proposto' then q.proposed_at else q.requested_at end) is not null
              and tstzrange(case when q.status = 'proposto' then q.proposed_at else q.requested_at end,
                            (case when q.status = 'proposto' then q.proposed_at else q.requested_at end)
                                + make_interval(mins => public._appointment_minutes(q.duration_minutes, q.service_id) + win.b)) && win.r
        ) then 'pedido'
        else null
    end;
$$;

-- Mantida por compatibilidade: livre = sem conflito duro.
create or replace function public._slot_is_free(
    p_nutritionist_id uuid, p_start timestamptz, p_minutes int,
    p_exclude_appointment uuid, p_exclude_request uuid
)
returns boolean language sql stable security definer set search_path = public
as $$
    select public._slot_hard_conflict(p_nutritionist_id, p_start, p_minutes, p_exclude_appointment, p_exclude_request) is null;
$$;

-- Dentro da grade? (sem grade configurada, não há o que conferir)
create or replace function public._within_grid(p_nutritionist_id uuid, p_start timestamptz, p_minutes int)
returns boolean language sql stable security definer set search_path = public
as $$
    with t0 as (
        select (p_start at time zone 'America/Sao_Paulo') as ls,
               (p_start at time zone 'America/Sao_Paulo') + make_interval(mins => p_minutes) as le
    )
    select not exists (select 1 from public.nutritionist_availability where nutritionist_id = p_nutritionist_id)
        or exists (
            select 1 from public.nutritionist_availability av, t0
            where av.nutritionist_id = p_nutritionist_id
              and av.weekday = extract(dow from t0.ls)::int
              and t0.le::date = t0.ls::date
              and t0.ls::time >= av.start_time and t0.le::time <= av.end_time
        );
$$;

-- Horários livres da grade entre duas datas (locais): passo configurado,
-- antecedência, limite de dias, bloqueios, consultas + intervalo e pedidos.
create or replace function public._free_slots(
    p_nutritionist_id uuid, p_from date, p_to date, p_minutes int,
    p_exclude_appointment uuid, p_exclude_request uuid
)
returns setof timestamptz language sql stable security definer set search_path = public
as $$
    with cfg as (select * from public._schedule_settings(p_nutritionist_id)),
    lim as (
        select greatest(p_from, (now() at time zone 'America/Sao_Paulo')::date) as d0,
               least(p_to, (now() at time zone 'America/Sao_Paulo')::date + cfg.max_days_ahead) as d1,
               now() + make_interval(hours => cfg.min_notice_hours) as earliest,
               cfg.slot_step_minutes as step
        from cfg
    )
    select distinct slot from (
        select (gs.local_start at time zone 'America/Sao_Paulo') as slot
        from lim
        cross join lateral generate_series(lim.d0::timestamp, lim.d1::timestamp, interval '1 day') d(day)
        join public.nutritionist_availability av
          on av.nutritionist_id = p_nutritionist_id
         and av.weekday = extract(dow from d.day)::int
        cross join lateral generate_series(
            d.day + av.start_time,
            d.day + av.end_time - make_interval(mins => p_minutes),
            make_interval(mins => lim.step)
        ) gs(local_start)
    ) s, lim
    where s.slot > lim.earliest
      and not public._is_blocked(p_nutritionist_id, s.slot, p_minutes)
      and public._slot_hard_conflict(p_nutritionist_id, s.slot, p_minutes, p_exclude_appointment, p_exclude_request) is null
    order by slot;
$$;

-- Aplica um pedido no horário/duração dados: move a consulta ou cria o retorno, já confirmado.
drop function if exists public._apply_change_request(uuid, timestamptz, uuid);
create or replace function public._apply_change_request(p_request_id uuid, p_at timestamptz, p_actor uuid, p_minutes int)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_req  public.appointment_change_requests;
    v_appt public.appointments;
    v_id   uuid;
begin
    select * into v_req from public.appointment_change_requests where id = p_request_id for update;
    if v_req.kind = 'reschedule' then
        select * into v_appt from public.appointments where id = v_req.appointment_id for update;
        if v_appt.id is null or v_appt.status not in ('pendente', 'confirmado') then
            raise exception 'Esta consulta foi cancelada ou já aconteceu.';
        end if;
        insert into public.appointment_reschedules (appointment_id, rescheduled_by, reason, old_date_time, new_date_time)
        values (v_appt.id, p_actor, 'Pedido do paciente pelo app', v_appt.date_time, p_at);
        update public.appointments set date_time = p_at, status = 'confirmado', duration_minutes = p_minutes
        where id = v_appt.id;
        v_id := v_appt.id;
    elsif v_req.kind = 'booking' then
        insert into public.appointments (clinic_id, patient_id, nutritionist_id, service_id, date_time, status, duration_minutes)
        values (v_req.clinic_id, v_req.patient_id, v_req.nutritionist_id, v_req.service_id, p_at, 'confirmado', p_minutes)
        returning id into v_id;
    else
        raise exception 'Tipo de pedido inválido.';
    end if;

    update public.appointment_change_requests
    set status = 'aceito', appointment_id = v_id, duration_minutes = p_minutes, handled_by = p_actor, handled_at = now()
    where id = p_request_id;
    return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPCs da equipe
-- ----------------------------------------------------------------------------

drop function if exists public.handle_change_request(uuid, text);
create or replace function public.handle_change_request(p_request_id uuid, p_status text, p_duration_minutes int default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
    v_minutes int;
    v_conflict text;
begin
    if p_status not in ('aceito', 'recusado') then
        raise exception 'Status inválido.';
    end if;
    if p_duration_minutes is not null and p_duration_minutes not between 10 and 600 then
        raise exception 'Duração inválida.';
    end if;
    if not public._can_handle_request(p_request_id) then
        raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
    select * into v_req from public.appointment_change_requests where id = p_request_id for update;

    if p_status = 'recusado' then
        if v_req.status in ('pendente', 'proposto') then
            update public.appointment_change_requests
            set status = 'recusado', handled_by = auth.uid(), handled_at = now()
            where id = p_request_id;
        end if;
        return;
    end if;

    if v_req.status <> 'pendente' then
        return;
    end if;
    if v_req.kind in ('reschedule', 'booking') and v_req.requested_at is not null then
        if v_req.requested_at <= now() then
            raise exception 'O horário pedido já passou. Sugira outra data ao paciente.';
        end if;
        v_minutes := coalesce(p_duration_minutes, public._appointment_minutes(v_req.duration_minutes, v_req.service_id));
        v_conflict := public._slot_hard_conflict(v_req.nutritionist_id, v_req.requested_at, v_minutes, v_req.appointment_id, v_req.id);
        if v_conflict is not null then
            raise exception 'Com essa duração, a consulta bate em outro horário ocupado. Ajuste a duração ou sugira outra data.';
        end if;
        perform public._apply_change_request(p_request_id, v_req.requested_at, auth.uid(), v_minutes);
    else
        update public.appointment_change_requests
        set status = 'aceito', handled_by = auth.uid(), handled_at = now()
        where id = p_request_id;
    end if;
end;
$$;

drop function if exists public.propose_change_request(uuid, timestamptz, text);
create or replace function public.propose_change_request(
    p_request_id uuid, p_proposed_at timestamptz, p_note text default null, p_duration_minutes int default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
    v_minutes int;
begin
    if not public._can_handle_request(p_request_id) then
        raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
    if p_duration_minutes is not null and p_duration_minutes not between 10 and 600 then
        raise exception 'Duração inválida.';
    end if;
    select * into v_req from public.appointment_change_requests where id = p_request_id for update;
    if v_req.kind not in ('reschedule', 'booking') or v_req.status not in ('pendente', 'proposto') then
        raise exception 'Este pedido não aceita mais sugestão de data.';
    end if;
    if p_proposed_at is null or p_proposed_at <= now() then
        raise exception 'Escolha uma data futura.';
    end if;
    v_minutes := coalesce(p_duration_minutes, public._appointment_minutes(v_req.duration_minutes, v_req.service_id));
    if public._slot_hard_conflict(v_req.nutritionist_id, p_proposed_at, v_minutes, v_req.appointment_id, v_req.id) is not null then
        raise exception 'Já existe consulta nesse horário. Escolha outro.';
    end if;
    update public.appointment_change_requests
    set status = 'proposto', proposed_at = p_proposed_at, duration_minutes = v_minutes,
        response_note = left(nullif(trim(p_note), ''), 500),
        handled_by = auth.uid(), handled_at = now()
    where id = p_request_id;
end;
$$;

-- Aviso de conflito para a Agenda da equipe (não impede salvar).
create or replace function public.check_schedule_conflict(
    p_nutritionist_id uuid, p_start timestamptz, p_minutes int, p_exclude_appointment uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
    v_kind text;
    v_at timestamptz;
begin
    if not exists (
        select 1 from public.clinic_members me
        join public.clinic_members pro on pro.clinic_id = me.clinic_id and pro.user_id = p_nutritionist_id
        where me.user_id = auth.uid() and public.acting_member_of(me.clinic_id)
    ) then
        raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    if p_start is null or p_minutes is null or p_minutes not between 10 and 600 then
        return jsonb_build_object('conflict', null);
    end if;

    v_kind := public._slot_hard_conflict(p_nutritionist_id, p_start, p_minutes, p_exclude_appointment, null);
    if v_kind = 'consulta' then
        select a.date_time into v_at from public.appointments a
        where a.nutritionist_id = p_nutritionist_id and a.status <> 'cancelado'
          and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
          and tstzrange(a.date_time, a.date_time + make_interval(mins => public._appointment_minutes(a.duration_minutes, a.service_id)
                        + (public._schedule_settings(p_nutritionist_id)).buffer_minutes))
              && tstzrange(p_start, p_start + make_interval(mins => p_minutes + (public._schedule_settings(p_nutritionist_id)).buffer_minutes))
        order by a.date_time limit 1;
    elsif v_kind is null then
        if public._is_blocked(p_nutritionist_id, p_start, p_minutes) then
            v_kind := 'bloqueio';
        elsif not public._within_grid(p_nutritionist_id, p_start, p_minutes) then
            v_kind := 'fora_da_grade';
        end if;
    end if;

    return jsonb_build_object('conflict', v_kind, 'with_time', v_at);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPCs do paciente (gravam a duração reservada)
-- ----------------------------------------------------------------------------

create or replace function public.portal_available_slots(p_from date, p_to date, p_appointment_id uuid default null)
returns setof timestamptz language plpgsql stable security definer set search_path = public
as $$
declare
    v_target record;
    v_minutes int;
    v_today date := (now() at time zone 'America/Sao_Paulo')::date;
    v_from date := greatest(coalesce(p_from, v_today), v_today);
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_target from public._portal_booking_target(p_appointment_id);
    if p_appointment_id is not null then
        select public._appointment_minutes(a.duration_minutes, a.service_id) into v_minutes
        from public.appointments a where a.id = p_appointment_id;
    else
        v_minutes := public._service_minutes(v_target.service_id);
    end if;
    return query
    select * from public._free_slots(
        v_target.nutritionist_id, v_from, least(coalesce(p_to, v_from + 13), v_from + 31),
        v_minutes, p_appointment_id, null);
end;
$$;

create or replace function public.portal_request_reschedule(p_appointment_id uuid, p_slot timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments := public.portal_lock_actionable_appointment(p_appointment_id);
    v_minutes int := public._appointment_minutes(v_appt.duration_minutes, v_appt.service_id);
    v_day date := (p_slot at time zone 'America/Sao_Paulo')::date;
begin
    if exists (select 1 from public.appointment_change_requests
               where appointment_id = v_appt.id and kind = 'reschedule' and status in ('pendente', 'proposto')) then
        raise exception 'Você já pediu para remarcar esta consulta. Aguarde o retorno da clínica.';
    end if;
    if not exists (select 1 from public._free_slots(v_appt.nutritionist_id, v_day, v_day, v_minutes, v_appt.id, null) s
                   where s = p_slot) then
        raise exception 'Este horário não está mais disponível. Escolha outro.';
    end if;
    insert into public.appointment_change_requests
        (appointment_id, patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, duration_minutes, note)
    values (v_appt.id, v_appt.patient_id, v_appt.clinic_id, 'reschedule', v_appt.nutritionist_id, v_appt.service_id,
            p_slot, v_minutes, left(nullif(trim(p_note), ''), 500));
end;
$$;

create or replace function public.portal_request_booking(p_slot timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
    v_patient public.patients;
    v_target record;
    v_minutes int;
    v_day date := (p_slot at time zone 'America/Sao_Paulo')::date;
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_patient from public.patients where id = v_pid;
    select * into v_target from public._portal_booking_target(null);
    v_minutes := public._service_minutes(v_target.service_id);
    if exists (select 1 from public.appointment_change_requests
               where patient_id = v_pid and kind = 'booking' and status in ('pendente', 'proposto')) then
        raise exception 'Você já tem um pedido de consulta aguardando resposta.';
    end if;
    if not exists (select 1 from public._free_slots(v_target.nutritionist_id, v_day, v_day, v_minutes, null, null) s
                   where s = p_slot) then
        raise exception 'Este horário não está mais disponível. Escolha outro.';
    end if;
    insert into public.appointment_change_requests
        (patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, duration_minutes, note)
    values (v_pid, v_patient.clinic_id, 'booking', v_target.nutritionist_id, v_target.service_id,
            p_slot, v_minutes, left(nullif(trim(p_note), ''), 500));
end;
$$;

create or replace function public.portal_respond_proposal(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
    v_minutes int;
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_req from public.appointment_change_requests
    where id = p_request_id and patient_id = public.current_patient_id()
    for update;
    if v_req.id is null or v_req.status <> 'proposto' then
        raise exception 'Esta sugestão não está mais disponível.';
    end if;

    if not p_accept then
        update public.appointment_change_requests
        set status = 'recusado', handled_by = auth.uid(), handled_at = now()
        where id = p_request_id;
        return;
    end if;

    if v_req.proposed_at <= now() then
        raise exception 'A data sugerida já passou. Peça outro horário.';
    end if;
    v_minutes := public._appointment_minutes(v_req.duration_minutes, v_req.service_id);
    if public._slot_hard_conflict(v_req.nutritionist_id, v_req.proposed_at, v_minutes, v_req.appointment_id, v_req.id) is not null then
        raise exception 'Este horário acabou de ser ocupado. Peça outro horário.';
    end if;
    perform public._apply_change_request(p_request_id, v_req.proposed_at, auth.uid(), v_minutes);
end;
$$;

-- Consultas do paciente com a duração real.
create or replace function public.portal_appointments()
returns table(
    id uuid, date_time timestamptz, status text,
    service_name text, duration_minutes int, modality text,
    nutritionist_name text,
    pending_request_kind text, pending_request_at timestamptz
)
language sql stable security definer set search_path = public
as $$
    select a.id, a.date_time, a.status,
           s.name, coalesce(a.duration_minutes, s.duration_minutes), s.modality,
           n.full_name,
           r.kind, r.created_at
    from public.appointments a
    left join public.services s on s.id = a.service_id
    left join public.profiles n on n.id = a.nutritionist_id
    left join lateral (
        select cr.kind, cr.created_at from public.appointment_change_requests cr
        where cr.appointment_id = a.id and cr.status = 'pendente' and cr.kind = 'reschedule'
        order by cr.created_at desc limit 1
    ) r on true
    where a.patient_id = public.current_patient_id()
    order by a.date_time desc;
$$;

-- ----------------------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public._schedule_settings(uuid)                                       from public, anon, authenticated;
revoke execute on function public._appointment_minutes(int, uuid)                               from public, anon, authenticated;
revoke execute on function public._is_blocked(uuid, timestamptz, int)                           from public, anon, authenticated;
revoke execute on function public._slot_hard_conflict(uuid, timestamptz, int, uuid, uuid)      from public, anon, authenticated;
revoke execute on function public._slot_is_free(uuid, timestamptz, int, uuid, uuid)            from public, anon, authenticated;
revoke execute on function public._within_grid(uuid, timestamptz, int)                          from public, anon, authenticated;
revoke execute on function public._free_slots(uuid, date, date, int, uuid, uuid)                from public, anon, authenticated;
revoke execute on function public._apply_change_request(uuid, timestamptz, uuid, int)          from public, anon, authenticated;
revoke execute on function public.handle_change_request(uuid, text, int)                       from public, anon;
revoke execute on function public.propose_change_request(uuid, timestamptz, text, int)        from public, anon;
revoke execute on function public.check_schedule_conflict(uuid, timestamptz, int, uuid)        from public, anon;

grant execute on function public.handle_change_request(uuid, text, int)                        to authenticated;
grant execute on function public.propose_change_request(uuid, timestamptz, text, int)         to authenticated;
grant execute on function public.check_schedule_conflict(uuid, timestamptz, int, uuid)         to authenticated;

commit;
