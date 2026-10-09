-- ============================================================================
-- Migration 0032 — Agenda online do Portal do Paciente
-- ============================================================================
--
-- Regras de negócio (decididas pelo dono do produto, 2026-10-09):
--   * Cada nutricionista define a própria grade semanal de atendimento
--     (nutritionist_availability) e folgas/férias (nutritionist_time_off).
--   * O paciente escolhe um horário LIVRE dessa grade para remarcar uma
--     consulta ou pedir um retorno (consulta nova, mesmo serviço da última).
--     Horário livre = dentro da grade, fora de folga, com 12h de antecedência,
--     sem conflito com consultas nem com pedidos em aberto (o pedido segura
--     o horário até ser respondido).
--   * A equipe aceita (a consulta muda/nasce na hora, já confirmada), recusa,
--     ou sugere outra data. A sugestão só vale quando o PACIENTE aceita no app.
--   * O paciente só enxerga horários — nunca dados de outras consultas.
--
-- Fuso: horários da grade são locais de America/Sao_Paulo.
-- Front-end: SlotPicker (portal), AvailabilityPanel (Configurações),
-- PatientRequestsPanel (Agenda). Publicar JUNTO com o front.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Grade semanal e folgas
-- ----------------------------------------------------------------------------
create table if not exists public.nutritionist_availability (
    id              uuid primary key default gen_random_uuid(),
    clinic_id       uuid not null references public.clinics(id) on delete cascade,
    nutritionist_id uuid not null references public.profiles(id) on delete cascade,
    weekday         smallint not null check (weekday between 0 and 6), -- 0 = domingo
    start_time      time not null,
    end_time        time not null,
    created_at      timestamptz not null default now(),
    check (end_time > start_time)
);
create index if not exists nutritionist_availability_idx on public.nutritionist_availability (nutritionist_id, weekday);

create table if not exists public.nutritionist_time_off (
    id              uuid primary key default gen_random_uuid(),
    clinic_id       uuid not null references public.clinics(id) on delete cascade,
    nutritionist_id uuid not null references public.profiles(id) on delete cascade,
    starts_on       date not null,
    ends_on         date not null,
    reason          text,
    created_at      timestamptz not null default now(),
    check (ends_on >= starts_on)
);
create index if not exists nutritionist_time_off_idx on public.nutritionist_time_off (nutritionist_id, starts_on);

alter table public.nutritionist_availability enable row level security;
alter table public.nutritionist_time_off     enable row level security;

-- A equipe da clínica vê a grade (a secretária agenda por ela); só o próprio
-- profissional altera a sua.
drop policy if exists nutritionist_availability_team_select on public.nutritionist_availability;
drop policy if exists nutritionist_availability_own_write   on public.nutritionist_availability;
create policy nutritionist_availability_team_select on public.nutritionist_availability for select to authenticated
    using (public.acting_member_of(clinic_id));
create policy nutritionist_availability_own_write on public.nutritionist_availability for all to authenticated
    using (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']))
    with check (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

drop policy if exists nutritionist_time_off_team_select on public.nutritionist_time_off;
drop policy if exists nutritionist_time_off_own_write   on public.nutritionist_time_off;
create policy nutritionist_time_off_team_select on public.nutritionist_time_off for select to authenticated
    using (public.acting_member_of(clinic_id));
create policy nutritionist_time_off_own_write on public.nutritionist_time_off for all to authenticated
    using (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']))
    with check (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

-- ----------------------------------------------------------------------------
-- 2. Pedidos: horário escolhido, retorno (booking) e contraproposta
-- ----------------------------------------------------------------------------
alter table public.appointment_change_requests
    alter column appointment_id drop not null,
    add column if not exists nutritionist_id uuid references public.profiles(id) on delete set null,
    add column if not exists service_id      uuid references public.services(id) on delete set null,
    add column if not exists requested_at    timestamptz,
    add column if not exists proposed_at     timestamptz,
    add column if not exists response_note   text;

update public.appointment_change_requests r
set nutritionist_id = a.nutritionist_id, service_id = a.service_id
from public.appointments a
where a.id = r.appointment_id and r.nutritionist_id is null;

alter table public.appointment_change_requests drop constraint if exists appointment_change_requests_kind_check;
alter table public.appointment_change_requests drop constraint if exists appointment_change_requests_status_check;
alter table public.appointment_change_requests drop constraint if exists appointment_change_requests_appointment_required;
alter table public.appointment_change_requests
    add constraint appointment_change_requests_kind_check
        check (kind in ('reschedule', 'cancel', 'booking')),
    add constraint appointment_change_requests_status_check
        check (status in ('pendente', 'proposto', 'aceito', 'recusado', 'cancelado')),
    add constraint appointment_change_requests_appointment_required
        check (kind = 'booking' or appointment_id is not null);

drop index if exists public.appointment_change_requests_one_pending;
create unique index if not exists appointment_change_requests_one_open_reschedule
    on public.appointment_change_requests (appointment_id)
    where kind = 'reschedule' and status in ('pendente', 'proposto');
create unique index if not exists appointment_change_requests_one_open_booking
    on public.appointment_change_requests (patient_id)
    where kind = 'booking' and status in ('pendente', 'proposto');
create index if not exists appointment_change_requests_nutri_idx
    on public.appointment_change_requests (nutritionist_id, status);

-- Retorno ainda não tem consulta: a visibilidade segue o profissional/paciente.
drop policy if exists appointment_change_requests_team_select on public.appointment_change_requests;
create policy appointment_change_requests_team_select on public.appointment_change_requests for select to authenticated
    using (
        public.acting_member_of(clinic_id)
        and (
            (appointment_id is not null and exists (select 1 from public.appointments a where a.id = appointment_id))
            or (appointment_id is null
                and (public.acting_member_of(clinic_id, array['secretary'])
                     or nutritionist_id = auth.uid()
                     or public.can_access_patient(patient_id)))
        )
    );

-- ----------------------------------------------------------------------------
-- 3. Horários livres (internos: não expostos ao cliente)
-- ----------------------------------------------------------------------------
create or replace function public._service_minutes(p_service_id uuid)
returns int language sql stable security definer set search_path = public
as $$
    select coalesce((select nullif(duration_minutes, 0) from public.services where id = p_service_id), 60);
$$;

-- O intervalo [p_start, p_start + p_minutes) está livre para o profissional?
create or replace function public._slot_is_free(
    p_nutritionist_id uuid, p_start timestamptz, p_minutes int,
    p_exclude_appointment uuid, p_exclude_request uuid
)
returns boolean language sql stable security definer set search_path = public
as $$
    select not exists (
        select 1 from public.appointments a
        where a.nutritionist_id = p_nutritionist_id
          and a.status <> 'cancelado'
          and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
          and tstzrange(a.date_time, a.date_time + make_interval(mins => public._service_minutes(a.service_id)))
              && tstzrange(p_start, p_start + make_interval(mins => p_minutes))
    )
    and not exists (
        select 1 from public.appointment_change_requests r
        where r.nutritionist_id = p_nutritionist_id
          and r.kind in ('reschedule', 'booking')
          and r.status in ('pendente', 'proposto')
          and (p_exclude_request is null or r.id <> p_exclude_request)
          and (case when r.status = 'proposto' then r.proposed_at else r.requested_at end) is not null
          and tstzrange(case when r.status = 'proposto' then r.proposed_at else r.requested_at end,
                        (case when r.status = 'proposto' then r.proposed_at else r.requested_at end)
                            + make_interval(mins => public._service_minutes(r.service_id)))
              && tstzrange(p_start, p_start + make_interval(mins => p_minutes))
    );
$$;

-- Horários livres da grade entre duas datas (locais), com 12h de antecedência.
create or replace function public._free_slots(
    p_nutritionist_id uuid, p_from date, p_to date, p_minutes int,
    p_exclude_appointment uuid, p_exclude_request uuid
)
returns setof timestamptz language sql stable security definer set search_path = public
as $$
    select distinct slot from (
        select (gs.local_start at time zone 'America/Sao_Paulo') as slot
        from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d(day)
        join public.nutritionist_availability av
          on av.nutritionist_id = p_nutritionist_id
         and av.weekday = extract(dow from d.day)::int
        cross join lateral generate_series(
            d.day + av.start_time,
            d.day + av.end_time - make_interval(mins => p_minutes),
            make_interval(mins => p_minutes)
        ) gs(local_start)
        where not exists (
            select 1 from public.nutritionist_time_off t
            where t.nutritionist_id = p_nutritionist_id
              and d.day::date between t.starts_on and t.ends_on
        )
    ) s
    where slot > now() + interval '12 hours'
      and public._slot_is_free(p_nutritionist_id, slot, p_minutes, p_exclude_appointment, p_exclude_request)
    order by slot;
$$;

-- Aplica um pedido no horário dado: move a consulta ou cria o retorno, já confirmado.
create or replace function public._apply_change_request(p_request_id uuid, p_at timestamptz, p_actor uuid)
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
        update public.appointments set date_time = p_at, status = 'confirmado' where id = v_appt.id;
        v_id := v_appt.id;
    elsif v_req.kind = 'booking' then
        insert into public.appointments (clinic_id, patient_id, nutritionist_id, service_id, date_time, status)
        values (v_req.clinic_id, v_req.patient_id, v_req.nutritionist_id, v_req.service_id, p_at, 'confirmado')
        returning id into v_id;
    else
        raise exception 'Tipo de pedido inválido.';
    end if;

    update public.appointment_change_requests
    set status = 'aceito', appointment_id = v_id, handled_by = p_actor, handled_at = now()
    where id = p_request_id;
    return v_id;
end;
$$;

-- A equipe pode tratar este pedido?
create or replace function public._can_handle_request(p_request_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.appointment_change_requests r
        left join public.appointments a on a.id = r.appointment_id
        where r.id = p_request_id
          and public.acting_member_of(r.clinic_id)
          and (public.acting_member_of(r.clinic_id, array['secretary'])
               or coalesce(a.nutritionist_id, r.nutritionist_id) = auth.uid()
               or public.can_access_patient(r.patient_id))
    );
$$;

-- ----------------------------------------------------------------------------
-- 4. RPCs da equipe
-- ----------------------------------------------------------------------------

-- Aceitar (aplica o horário pedido) ou recusar. Pedido antigo, sem horário
-- escolhido, só é marcado (a equipe reagenda pela Agenda, como antes).
create or replace function public.handle_change_request(p_request_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
begin
    if p_status not in ('aceito', 'recusado') then
        raise exception 'Status inválido.';
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
        if not public._slot_is_free(v_req.nutritionist_id, v_req.requested_at,
                                    public._service_minutes(v_req.service_id), v_req.appointment_id, v_req.id) then
            raise exception 'Este horário já foi ocupado. Sugira outra data ao paciente.';
        end if;
        perform public._apply_change_request(p_request_id, v_req.requested_at, auth.uid());
    else
        update public.appointment_change_requests
        set status = 'aceito', handled_by = auth.uid(), handled_at = now()
        where id = p_request_id;
    end if;
end;
$$;

-- Sugerir outra data: vale quando o paciente aceitar no app.
create or replace function public.propose_change_request(p_request_id uuid, p_proposed_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
begin
    if not public._can_handle_request(p_request_id) then
        raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
    select * into v_req from public.appointment_change_requests where id = p_request_id for update;
    if v_req.kind not in ('reschedule', 'booking') or v_req.status not in ('pendente', 'proposto') then
        raise exception 'Este pedido não aceita mais sugestão de data.';
    end if;
    if p_proposed_at is null or p_proposed_at <= now() then
        raise exception 'Escolha uma data futura.';
    end if;
    if not public._slot_is_free(v_req.nutritionist_id, p_proposed_at,
                                public._service_minutes(v_req.service_id), v_req.appointment_id, v_req.id) then
        raise exception 'Já existe consulta nesse horário. Escolha outro.';
    end if;
    update public.appointment_change_requests
    set status = 'proposto', proposed_at = p_proposed_at,
        response_note = left(nullif(trim(p_note), ''), 500),
        handled_by = auth.uid(), handled_at = now()
    where id = p_request_id;
end;
$$;

-- Horários livres de um profissional da mesma clínica (para a equipe sugerir).
create or replace function public.staff_available_slots(
    p_nutritionist_id uuid, p_from date, p_to date, p_minutes int,
    p_exclude_appointment uuid default null, p_exclude_request uuid default null
)
returns setof timestamptz language plpgsql stable security definer set search_path = public
as $$
begin
    if not exists (
        select 1 from public.clinic_members me
        join public.clinic_members pro on pro.clinic_id = me.clinic_id and pro.user_id = p_nutritionist_id
        where me.user_id = auth.uid() and public.acting_member_of(me.clinic_id)
    ) then
        raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    return query
    select * from public._free_slots(
        p_nutritionist_id, greatest(p_from, current_date), least(p_to, greatest(p_from, current_date) + 31),
        greatest(coalesce(p_minutes, 60), 15), p_exclude_appointment, p_exclude_request);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPCs do paciente
-- ----------------------------------------------------------------------------

-- Profissional e serviço do agendamento pelo app: os da consulta (remarcar)
-- ou o responsável + o serviço da última consulta (retorno).
create or replace function public._portal_booking_target(p_appointment_id uuid,
    out nutritionist_id uuid, out service_id uuid)
language plpgsql stable security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
begin
    if p_appointment_id is not null then
        select a.nutritionist_id, a.service_id into nutritionist_id, service_id
        from public.appointments a where a.id = p_appointment_id and a.patient_id = v_pid;
        if nutritionist_id is null then
            raise exception 'Consulta não encontrada.';
        end if;
    else
        select p.nutritionist_id into nutritionist_id from public.patients p where p.id = v_pid;
        select a.service_id into service_id from public.appointments a
        where a.patient_id = v_pid and a.service_id is not null
        order by a.date_time desc limit 1;
    end if;
end;
$$;

create or replace function public.portal_available_slots(p_from date, p_to date, p_appointment_id uuid default null)
returns setof timestamptz language plpgsql stable security definer set search_path = public
as $$
declare
    v_target record;
    v_today date := (now() at time zone 'America/Sao_Paulo')::date;
    v_from date := greatest(coalesce(p_from, v_today), v_today);
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_target from public._portal_booking_target(p_appointment_id);
    return query
    select * from public._free_slots(
        v_target.nutritionist_id, v_from, least(coalesce(p_to, v_from + 13), v_from + 31, v_today + 60),
        public._service_minutes(v_target.service_id), p_appointment_id, null);
end;
$$;

-- Remarcar escolhendo um horário livre (substitui a versão com texto livre).
drop function if exists public.portal_request_reschedule(uuid, text, text);
create or replace function public.portal_request_reschedule(p_appointment_id uuid, p_slot timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments := public.portal_lock_actionable_appointment(p_appointment_id);
    v_minutes int := public._service_minutes(v_appt.service_id);
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
        (appointment_id, patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, note)
    values (v_appt.id, v_appt.patient_id, v_appt.clinic_id, 'reschedule', v_appt.nutritionist_id, v_appt.service_id,
            p_slot, left(nullif(trim(p_note), ''), 500));
end;
$$;

-- Pedir um retorno (consulta nova) num horário livre.
create or replace function public.portal_request_booking(p_slot timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
    v_patient public.patients;
    v_target record;
    v_day date := (p_slot at time zone 'America/Sao_Paulo')::date;
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    select * into v_patient from public.patients where id = v_pid;
    select * into v_target from public._portal_booking_target(null);
    if exists (select 1 from public.appointment_change_requests
               where patient_id = v_pid and kind = 'booking' and status in ('pendente', 'proposto')) then
        raise exception 'Você já tem um pedido de consulta aguardando resposta.';
    end if;
    if not exists (select 1 from public._free_slots(v_target.nutritionist_id, v_day, v_day,
                                                    public._service_minutes(v_target.service_id), null, null) s
                   where s = p_slot) then
        raise exception 'Este horário não está mais disponível. Escolha outro.';
    end if;
    insert into public.appointment_change_requests
        (patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, note)
    values (v_pid, v_patient.clinic_id, 'booking', v_target.nutritionist_id, v_target.service_id,
            p_slot, left(nullif(trim(p_note), ''), 500));
end;
$$;

-- Responder à data sugerida pela clínica.
create or replace function public.portal_respond_proposal(p_request_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
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
    if not public._slot_is_free(v_req.nutritionist_id, v_req.proposed_at,
                                public._service_minutes(v_req.service_id), v_req.appointment_id, v_req.id) then
        raise exception 'Este horário acabou de ser ocupado. Peça outro horário.';
    end if;
    perform public._apply_change_request(p_request_id, v_req.proposed_at, auth.uid());
end;
$$;

-- Desistir de um pedido em aberto.
create or replace function public.portal_cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
    update public.appointment_change_requests
    set status = 'cancelado', handled_by = auth.uid(), handled_at = now()
    where id = p_request_id
      and patient_id = public.current_patient_id()
      and kind in ('reschedule', 'booking')
      and status in ('pendente', 'proposto');
end;
$$;

-- Pedidos do paciente: abertos, e os respondidos nos últimos 14 dias.
create or replace function public.portal_requests()
returns table(
    id uuid, kind text, status text, appointment_id uuid,
    requested_at timestamptz, proposed_at timestamptz, response_note text,
    service_name text, created_at timestamptz, handled_at timestamptz, declined_by_patient boolean
)
language sql stable security definer set search_path = public
as $$
    select r.id, r.kind, r.status, r.appointment_id,
           r.requested_at, r.proposed_at, r.response_note,
           s.name, r.created_at, r.handled_at,
           (r.handled_by is not null and r.handled_by = auth.uid())
    from public.appointment_change_requests r
    left join public.services s on s.id = r.service_id
    where r.patient_id = public.current_patient_id()
      and r.kind in ('reschedule', 'booking')
      and (r.status in ('pendente', 'proposto') or r.handled_at > now() - interval '14 days')
    order by r.created_at desc;
$$;

-- portal_context ganha `booking_enabled` (o nutricionista configurou a grade).
create or replace function public.portal_context()
returns jsonb language sql stable security definer set search_path = public
as $$
    select case when p.id is null then null else jsonb_build_object(
        'patient_id', p.id,
        'name', p.name,
        'email', p.email,
        'phone', p.phone,
        'birth_date', p.birth_date,
        'main_goal', p.main_goal,
        'access_until', p.portal_access_until,
        'active', p.portal_access_until > now() and p.status = 'ativo',
        'terms_version', p.portal_terms_version,
        'terms_accepted_at', p.portal_terms_accepted_at,
        'nutritionist_name', n.full_name,
        'nutritionist_crn', n.crn,
        'booking_enabled', exists (select 1 from public.nutritionist_availability av where av.nutritionist_id = p.nutritionist_id),
        'clinic', jsonb_build_object(
            'name', c.name, 'phone', c.phone, 'email', c.email,
            'address', c.address, 'city', c.city, 'state', c.state
        )
    ) end
    from (select public.current_patient_id() as id) cur
    left join public.patients p on p.id = cur.id
    left join public.profiles n on n.id = p.nutritionist_id
    left join public.clinics  c on c.id = p.clinic_id;
$$;

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public._service_minutes(uuid)                                           from public, anon, authenticated;
revoke execute on function public._slot_is_free(uuid, timestamptz, int, uuid, uuid)                from public, anon, authenticated;
revoke execute on function public._free_slots(uuid, date, date, int, uuid, uuid)                    from public, anon, authenticated;
revoke execute on function public._apply_change_request(uuid, timestamptz, uuid)                   from public, anon, authenticated;
revoke execute on function public._can_handle_request(uuid)                                        from public, anon, authenticated;
revoke execute on function public._portal_booking_target(uuid)                                     from public, anon, authenticated;
revoke execute on function public.handle_change_request(uuid, text)                                from public, anon;
revoke execute on function public.propose_change_request(uuid, timestamptz, text)                  from public, anon;
revoke execute on function public.staff_available_slots(uuid, date, date, int, uuid, uuid)          from public, anon;
revoke execute on function public.portal_available_slots(date, date, uuid)                          from public, anon;
revoke execute on function public.portal_request_reschedule(uuid, timestamptz, text)                from public, anon;
revoke execute on function public.portal_request_booking(timestamptz, text)                         from public, anon;
revoke execute on function public.portal_respond_proposal(uuid, boolean)                            from public, anon;
revoke execute on function public.portal_cancel_request(uuid)                                       from public, anon;
revoke execute on function public.portal_requests()                                                 from public, anon;
revoke execute on function public.portal_context()                                                  from public, anon;

grant execute on function public.handle_change_request(uuid, text)                                 to authenticated;
grant execute on function public.propose_change_request(uuid, timestamptz, text)                   to authenticated;
grant execute on function public.staff_available_slots(uuid, date, date, int, uuid, uuid)           to authenticated;
grant execute on function public.portal_available_slots(date, date, uuid)                           to authenticated;
grant execute on function public.portal_request_reschedule(uuid, timestamptz, text)                 to authenticated;
grant execute on function public.portal_request_booking(timestamptz, text)                          to authenticated;
grant execute on function public.portal_respond_proposal(uuid, boolean)                             to authenticated;
grant execute on function public.portal_cancel_request(uuid)                                        to authenticated;
grant execute on function public.portal_requests()                                                  to authenticated;
grant execute on function public.portal_context()                                                   to authenticated;

commit;
