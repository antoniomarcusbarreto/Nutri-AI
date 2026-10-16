-- ============================================================================
-- Migration 0043 — Teleconsulta (fase 1: videochamada pelo Daily.co)
-- ============================================================================
--
-- Regras (decididas pelo dono do produto, 2026-10-16):
--   * A modalidade passa a ser da CONSULTA (appointments.modality), não só do
--     serviço. Quem agenda (secretária, nutricionista ou o paciente pelo
--     portal) escolhe presencial ou online. services.modality vira só a
--     sugestão inicial do formulário.
--   * A sala de vídeo é criada sob demanda pela Edge Function teleconsult-join
--     e só o nutricionista responsável pela consulta e o próprio paciente
--     recebem token. Secretária e outros profissionais, não.
--   * A sala abre 10 min antes do horário e expira 30 min depois do fim.
--   * teleconsult_rooms é interna (só service role): o nome da sala nunca
--     chega ao cliente por consulta ao banco, só junto do token.
--   * Disponível para todos os planos por enquanto: clinic_has_feature() é o
--     ponto único para limitar por plano depois.
--
-- PASSO MANUAL (uma vez, no SQL Editor), com o MESMO valor do secret
-- TELECONSULT_CRON_SECRET das Edge Functions:
--   select vault.create_secret('<valor>', 'teleconsult_cron_secret');
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Modalidade na consulta e no pedido do portal
-- ----------------------------------------------------------------------------
alter table public.appointments
    add column if not exists modality text not null default 'presencial'
        check (modality in ('presencial', 'online'));

update public.appointments a
set modality = 'online'
from public.services s
where s.id = a.service_id and s.modality = 'online' and a.modality <> 'online';

-- Nulo = mantém a modalidade (remarcação) ou presencial (agendamento antigo).
alter table public.appointment_change_requests
    add column if not exists modality text check (modality is null or modality in ('presencial', 'online'));

-- ----------------------------------------------------------------------------
-- 2. Plano: ponto único para liberar/limitar recursos
-- ----------------------------------------------------------------------------
-- Hoje tudo liberado. Para limitar por plano, trocar o corpo por algo como:
--   select exists (select 1 from public.clinics c where c.id = p_clinic_id
--                  and (p_feature <> 'teleconsulta' or c.plan_level = 'pro'));
create or replace function public.clinic_has_feature(p_clinic_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public
as $$
    select p_clinic_id is not null and p_feature in ('teleconsulta', 'teleconsulta_transcricao');
$$;

-- ----------------------------------------------------------------------------
-- 3. Pedido de consulta pelo portal com a modalidade
-- ----------------------------------------------------------------------------
drop function if exists public.portal_request_booking(timestamptz, text);
create or replace function public.portal_request_booking(
    p_slot timestamptz, p_note text default null, p_modality text default 'presencial'
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_pid uuid := public.current_patient_id();
    v_patient public.patients;
    v_target record;
    v_minutes int;
    v_day date := (p_slot at time zone 'America/Sao_Paulo')::date;
    v_modality text := coalesce(nullif(p_modality, ''), 'presencial');
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    if v_modality not in ('presencial', 'online') then
        raise exception 'Escolha presencial ou online.';
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
        (patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, duration_minutes, note, modality)
    values (v_pid, v_patient.clinic_id, 'booking', v_target.nutritionist_id, v_target.service_id,
            p_slot, v_minutes, left(nullif(trim(p_note), ''), 500), v_modality);
end;
$$;

-- Aplica um pedido: igual à 0035, mas o agendamento novo nasce com a
-- modalidade pedida. Remarcação não mexe na modalidade.
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
        insert into public.appointments (clinic_id, patient_id, nutritionist_id, service_id, date_time, status, duration_minutes, modality)
        values (v_req.clinic_id, v_req.patient_id, v_req.nutritionist_id, v_req.service_id, p_at, 'confirmado', p_minutes,
                coalesce(v_req.modality, 'presencial'))
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

-- Consultas do paciente: a modalidade agora vem da consulta.
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
           s.name, coalesce(a.duration_minutes, s.duration_minutes), a.modality,
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
-- 4. Salas de vídeo (internas: só service role)
-- ----------------------------------------------------------------------------
create table if not exists public.teleconsult_rooms (
    appointment_id uuid primary key references public.appointments(id) on delete cascade,
    clinic_id      uuid not null references public.clinics(id) on delete cascade,
    room_name      text not null unique,
    room_url       text not null,
    not_before     timestamptz not null,
    expires_at     timestamptz not null,
    created_at     timestamptz not null default now(),
    deleted_at     timestamptz
);
create index if not exists teleconsult_rooms_open_idx
    on public.teleconsult_rooms (expires_at) where deleted_at is null;

-- RLS ligada e sem policy: anon/authenticated não leem nem escrevem.
alter table public.teleconsult_rooms enable row level security;
revoke all on public.teleconsult_rooms from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Quem pode entrar na teleconsulta (usado pela Edge Function teleconsult-join)
-- ----------------------------------------------------------------------------
-- Devolve a consulta com o papel de quem chama, ou nada se a pessoa não for
-- o nutricionista responsável nem o paciente da consulta. A secretária e
-- outros profissionais (mesmo com acesso ao paciente) não entram na sala.
create or replace function public.teleconsult_appointment(p_appointment_id uuid)
returns table(
    id uuid, clinic_id uuid, role text, status text, modality text,
    starts_at timestamptz, ends_at timestamptz,
    patient_id uuid, nutritionist_id uuid,
    patient_name text, nutritionist_name text,
    feature_enabled boolean
)
language sql stable security definer set search_path = public
as $$
    select a.id, a.clinic_id,
           case when a.nutritionist_id = auth.uid() then 'nutricionista' else 'paciente' end,
           a.status, a.modality,
           a.date_time,
           a.date_time + make_interval(mins => public._appointment_minutes(a.duration_minutes, a.service_id)),
           a.patient_id, a.nutritionist_id,
           p.name, n.full_name,
           public.clinic_has_feature(a.clinic_id, 'teleconsulta')
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    left join public.profiles n on n.id = a.nutritionist_id
    where a.id = p_appointment_id
      and (
          (a.nutritionist_id = auth.uid() and public.acting_member_of(a.clinic_id, array['owner', 'nutritionist']))
          or (a.patient_id = public.current_patient_id())
      );
$$;

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.clinic_has_feature(uuid, text)                     from public, anon;
revoke execute on function public.portal_request_booking(timestamptz, text, text)   from public, anon;
revoke execute on function public._apply_change_request(uuid, timestamptz, uuid, int) from public, anon, authenticated;
revoke execute on function public.portal_appointments()                              from public, anon;
revoke execute on function public.teleconsult_appointment(uuid)                      from public, anon;

grant execute on function public.clinic_has_feature(uuid, text)                      to authenticated;
grant execute on function public.portal_request_booking(timestamptz, text, text)    to authenticated;
grant execute on function public.portal_appointments()                               to authenticated;
grant execute on function public.teleconsult_appointment(uuid)                       to authenticated;

commit;

-- ----------------------------------------------------------------------------
-- Limpeza das salas vencidas (fora da transação: extensões e cron)
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('teleconsult-cleanup')
where exists (select 1 from cron.job where jobname = 'teleconsult-cleanup');

select cron.schedule(
    'teleconsult-cleanup',
    '*/30 * * * *',
    $cron$
    select net.http_post(
        url := 'https://dtkoegdmmhnxsrrxmoiq.supabase.co/functions/v1/teleconsult-cleanup',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                              where name = 'teleconsult_cron_secret' limit 1)
        ),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 60000
    );
    $cron$
);
