-- ============================================================================
-- Migration 0031 — Portal do Paciente, Fase 1 (convite + plano + agenda)
-- ============================================================================
--
-- Regras de negócio (decididas pelo dono do produto, 2026-10-09):
--   * O nutricionista libera o portal por CONVITE: link de uso único (72h). O
--     paciente confirma, com um código de 6 dígitos, o e-mail que o
--     nutricionista cadastrou e cria a própria senha (Edge Function
--     `portal-invite`). Repassar o link não dá acesso a terceiros.
--   * O acesso tem prazo definido pelo nutricionista (patients.portal_access_until):
--       - null        → sem acesso (nunca liberado ou revogado);
--       - no passado  → somente leitura (vê plano e agenda, não age);
--       - no futuro   → acesso completo.
--   * O paciente nunca grava direto em tabela: confirmar, cancelar e pedir
--     reagendamento passam por RPCs que validam dono, prazo e status.
--   * Pedido de reagendamento NÃO muda a data: a equipe reagenda pelo fluxo
--     de sempre (appointment_reschedules) e marca o pedido como atendido.
--
-- Contas criadas antes desta migration (senha definida pela equipe) recebem
-- 90 dias de acesso para ninguém perder o portal de surpresa.
--
-- Front-end correspondente: PortalInvite, portal/*, PortalAccessModal,
-- Agenda (pedidos de pacientes). Publicar JUNTO com esta migration e com a
-- Edge Function `portal-invite` (verify_jwt = false).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Prazo de acesso e consentimento
-- ----------------------------------------------------------------------------
alter table public.patients
    add column if not exists portal_access_until      timestamptz,
    add column if not exists portal_terms_accepted_at timestamptz,
    add column if not exists portal_terms_version     text;

update public.patients
set portal_access_until = now() + interval '90 days'
where user_id is not null and portal_access_until is null;

-- Colunas do portal só mudam pelas RPCs abaixo (SECURITY DEFINER), nunca por
-- UPDATE direto da equipe ou do paciente.
create or replace function public.enforce_patient_portal_columns()
returns trigger language plpgsql set search_path = public
as $$
begin
    if current_user in ('authenticated', 'anon')
       and (new.portal_access_until      is distinct from old.portal_access_until
            or new.portal_terms_accepted_at is distinct from old.portal_terms_accepted_at
            or new.portal_terms_version     is distinct from old.portal_terms_version
            or new.user_id                  is distinct from old.user_id) then
        raise exception 'O acesso ao portal só pode ser alterado pelo convite.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists trg_enforce_patient_portal_columns on public.patients;
create trigger trg_enforce_patient_portal_columns
    before update on public.patients
    for each row execute function public.enforce_patient_portal_columns();

-- ----------------------------------------------------------------------------
-- 2. Convites
-- ----------------------------------------------------------------------------
create table if not exists public.patient_portal_invites (
    id              uuid primary key default gen_random_uuid(),
    patient_id      uuid not null references public.patients(id) on delete cascade,
    clinic_id       uuid not null references public.clinics(id) on delete cascade,
    created_by      uuid references public.profiles(id) on delete set null,
    token_hash      text not null unique,
    expires_at      timestamptz not null,
    code_hash       text,
    code_expires_at timestamptz,
    code_sent_at    timestamptz,
    code_attempts   int not null default 0,
    used_at         timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz not null default now()
);
create index if not exists patient_portal_invites_patient_idx on public.patient_portal_invites (patient_id);

alter table public.patient_portal_invites enable row level security;
-- Sem policies: o hash do código de 6 dígitos é quebrável offline, então nem a
-- equipe lê esta tabela. Status sai por get_portal_invite_status(); o resto é
-- da Edge Function (service_role).

-- ----------------------------------------------------------------------------
-- 3. Pedidos do paciente sobre consultas
-- ----------------------------------------------------------------------------
create table if not exists public.appointment_change_requests (
    id              uuid primary key default gen_random_uuid(),
    appointment_id  uuid not null references public.appointments(id) on delete cascade,
    patient_id      uuid not null references public.patients(id) on delete cascade,
    clinic_id       uuid not null references public.clinics(id) on delete cascade,
    kind            text not null check (kind in ('reschedule', 'cancel')),
    preferred_times text,
    note            text,
    status          text not null default 'pendente'
                    check (status in ('pendente', 'aceito', 'recusado', 'cancelado')),
    handled_by      uuid references public.profiles(id) on delete set null,
    handled_at      timestamptz,
    created_at      timestamptz not null default now()
);
create index if not exists appointment_change_requests_clinic_idx
    on public.appointment_change_requests (clinic_id, status);
create unique index if not exists appointment_change_requests_one_pending
    on public.appointment_change_requests (appointment_id)
    where status = 'pendente' and kind = 'reschedule';

alter table public.appointment_change_requests enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Helpers do paciente
-- ----------------------------------------------------------------------------

-- Cadastro do paciente logado (com acesso já liberado alguma vez).
create or replace function public.current_patient_id()
returns uuid language sql stable security definer set search_path = public
as $$
    select p.id from public.patients p
    where p.user_id = auth.uid()
      and p.portal_access_until is not null
      and public.is_account_active(auth.uid())
    order by p.portal_access_until desc, p.created_at desc
    limit 1;
$$;

-- Pode AGIR no portal (prazo vigente e paciente ativo)?
create or replace function public.patient_portal_active()
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.patients p
        where p.id = public.current_patient_id()
          and p.portal_access_until > now()
          and p.status = 'ativo'
    );
$$;

-- ----------------------------------------------------------------------------
-- 5. Policies
-- ----------------------------------------------------------------------------

-- Paciente lê os próprios planos (inclusive com o prazo vencido).
drop policy if exists meal_plans_patient_select on public.meal_plans;
create policy meal_plans_patient_select on public.meal_plans for select to authenticated
    using (patient_id = public.current_patient_id());

-- Pedidos: a equipe vê os pedidos das consultas que ela já enxerga (a
-- subquery passa pelo RLS de appointments); o paciente vê os seus.
drop policy if exists appointment_change_requests_team_select    on public.appointment_change_requests;
drop policy if exists appointment_change_requests_patient_select on public.appointment_change_requests;
create policy appointment_change_requests_team_select on public.appointment_change_requests for select to authenticated
    using (public.acting_member_of(clinic_id)
           and exists (select 1 from public.appointments a where a.id = appointment_id));
create policy appointment_change_requests_patient_select on public.appointment_change_requests for select to authenticated
    using (patient_id = public.current_patient_id());

-- ----------------------------------------------------------------------------
-- 6. RPCs da equipe
-- ----------------------------------------------------------------------------

-- Cadastro do paciente SEM conta de login: a conta nasce no aceite do convite.
drop function if exists public.create_patient_account(uuid, text, text, text, text, text, text, date, text, text, uuid);
create or replace function public.create_patient_account(
    p_clinic_id uuid, p_name text, p_cpf text, p_email text, p_phone text,
    p_status text, p_birth_date date, p_biological_sex text, p_main_goal text,
    p_nutritionist_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_email text := nullif(lower(trim(p_email)), '');
    v_responsible uuid := p_nutritionist_id;
    v_patient_id uuid;
begin
    if public.acting_member_of(p_clinic_id, array['owner', 'nutritionist']) then
        -- Profissional cadastra para si (não cria paciente "na conta" de colega).
        v_responsible := auth.uid();
    elsif public.acting_member_of(p_clinic_id, array['secretary']) then
        if v_responsible is null then
            raise exception 'Escolha o nutricionista responsável pelo paciente.';
        end if;
    else
        raise exception 'Acesso negado. Apenas equipe autorizada pode cadastrar pacientes.' using errcode = '42501';
    end if;

    if not public.is_clinic_professional(p_clinic_id, v_responsible) then
        raise exception 'O nutricionista responsável precisa ser um profissional ativo desta clínica.';
    end if;

    if v_email is not null then
        select id into v_patient_id from public.patients
        where clinic_id = p_clinic_id and lower(email) = v_email
        limit 1;
    end if;

    if v_patient_id is not null then
        -- Recadastro do mesmo e-mail: só quem já enxerga o paciente pode atualizá-lo.
        if not (public.can_access_patient(v_patient_id) or public.acting_member_of(p_clinic_id, array['secretary'])) then
            raise exception 'Este paciente já está cadastrado com outro nutricionista. Peça acesso a ele.'
                using errcode = '42501';
        end if;
        update public.patients
        set name = p_name, cpf = p_cpf, phone = p_phone, status = p_status,
            birth_date = p_birth_date, biological_sex = p_biological_sex, main_goal = p_main_goal
        where id = v_patient_id;
    else
        insert into public.patients (clinic_id, nutritionist_id, name, cpf, email, phone,
                                     status, birth_date, biological_sex, main_goal)
        values (p_clinic_id, v_responsible, p_name, p_cpf, v_email, p_phone,
                p_status, p_birth_date, p_biological_sex, p_main_goal)
        returning id into v_patient_id;
        insert into public.patient_health (patient_id) values (v_patient_id) on conflict do nothing;
    end if;

    return v_patient_id;
end;
$$;

-- Gera o convite (devolve o token UMA vez; o banco guarda só o hash) e
-- define o prazo de acesso.
create or replace function public.create_portal_invite(p_patient_id uuid, p_access_until timestamptz)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare
    v_patient public.patients;
    v_token text;
    v_staff boolean;
begin
    if not public.can_access_patient(p_patient_id) then
        raise exception 'Apenas o nutricionista do paciente pode liberar o acesso ao app.' using errcode = '42501';
    end if;
    if p_access_until is null or p_access_until <= now() then
        raise exception 'Escolha uma data futura para o fim do acesso.';
    end if;
    if p_access_until > now() + interval '2 years' then
        raise exception 'O acesso pode ser liberado por no máximo 2 anos de cada vez.';
    end if;

    select * into v_patient from public.patients where id = p_patient_id;
    if v_patient.email is null or v_patient.email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
        raise exception 'Cadastre um e-mail válido do paciente antes de gerar o convite.';
    end if;

    -- E-mail de alguém da equipe ou do Master não vira login de paciente.
    select exists (
        select 1 from auth.users u
        where lower(u.email) = lower(v_patient.email)
          and (exists (select 1 from public.clinic_members m where m.user_id = u.id)
               or public.is_superadmin(u.id))
    ) into v_staff;
    if v_staff then
        raise exception 'Este e-mail pertence a uma conta da equipe. Cadastre outro e-mail para o paciente.'
            using errcode = '23505';
    end if;

    update public.patient_portal_invites
    set revoked_at = now()
    where patient_id = p_patient_id and used_at is null and revoked_at is null;

    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.patient_portal_invites (patient_id, clinic_id, created_by, token_hash, expires_at)
    values (p_patient_id, v_patient.clinic_id, auth.uid(),
            encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '72 hours');

    update public.patients set portal_access_until = p_access_until where id = p_patient_id;

    -- Liberar de novo reativa a conta de login, se ela existir e for só de paciente.
    if v_patient.user_id is not null and public.is_patient_only_of_clinic(v_patient.user_id, v_patient.clinic_id) then
        update public.profiles set is_active = true where id = v_patient.user_id;
    end if;

    return v_token;
end;
$$;

-- Renova (data futura) ou encerra (null) o acesso. Data no passado = somente leitura.
create or replace function public.set_portal_access(p_patient_id uuid, p_access_until timestamptz)
returns void language plpgsql security definer set search_path = public
as $$
begin
    if not public.can_access_patient(p_patient_id) then
        raise exception 'Apenas o nutricionista do paciente pode alterar o acesso ao app.' using errcode = '42501';
    end if;
    if p_access_until is not null and p_access_until > now() + interval '2 years' then
        raise exception 'O acesso pode ser liberado por no máximo 2 anos de cada vez.';
    end if;
    if p_access_until is null then
        update public.patient_portal_invites
        set revoked_at = now()
        where patient_id = p_patient_id and used_at is null and revoked_at is null;
    end if;
    update public.patients set portal_access_until = p_access_until where id = p_patient_id;
end;
$$;

-- Convite pendente (sem expor hashes).
create or replace function public.get_portal_invite_status(p_patient_id uuid)
returns table(pending_expires_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
    if not public.can_access_patient(p_patient_id) then
        raise exception 'Acesso negado a este paciente.' using errcode = '42501';
    end if;
    return query
    select
        (select max(i.expires_at) from public.patient_portal_invites i
          where i.patient_id = p_patient_id and i.used_at is null and i.revoked_at is null
            and i.expires_at > now()),
        (select max(i.used_at) from public.patient_portal_invites i where i.patient_id = p_patient_id);
end;
$$;

-- A equipe resolve um pedido do paciente.
create or replace function public.handle_change_request(p_request_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_req public.appointment_change_requests;
    v_appt public.appointments;
begin
    if p_status not in ('aceito', 'recusado') then
        raise exception 'Status inválido.';
    end if;
    select * into v_req from public.appointment_change_requests where id = p_request_id;
    if v_req.id is null then
        raise exception 'Pedido não encontrado.';
    end if;
    select * into v_appt from public.appointments where id = v_req.appointment_id;
    if not (public.acting_member_of(v_appt.clinic_id)
            and (public.acting_member_of(v_appt.clinic_id, array['secretary'])
                 or v_appt.nutritionist_id = auth.uid()
                 or public.can_access_patient(v_appt.patient_id))) then
        raise exception 'Acesso negado a este pedido.' using errcode = '42501';
    end if;
    if v_req.status <> 'pendente' then
        return;
    end if;
    update public.appointment_change_requests
    set status = p_status, handled_by = auth.uid(), handled_at = now()
    where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPCs do paciente
-- ----------------------------------------------------------------------------

-- Tudo o que o portal precisa saber sobre o paciente logado, sem abrir o RLS
-- de profiles/clinics para ele.
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

create or replace function public.portal_accept_terms(p_version text)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_id uuid := public.current_patient_id();
begin
    if v_id is null then
        raise exception 'Acesso ao portal não liberado.' using errcode = '42501';
    end if;
    if p_version is null or length(p_version) > 32 then
        raise exception 'Versão dos termos inválida.';
    end if;
    update public.patients
    set portal_terms_accepted_at = now(), portal_terms_version = p_version
    where id = v_id;
end;
$$;

-- Consultas do paciente, com serviço, profissional e pedido pendente.
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
           s.name, s.duration_minutes, s.modality,
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

-- Consulta do paciente que ainda aceita ação (futura, pendente/confirmada).
create or replace function public.portal_lock_actionable_appointment(p_appointment_id uuid)
returns public.appointments language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments;
begin
    if not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.'
            using errcode = '42501';
    end if;
    select * into v_appt from public.appointments
    where id = p_appointment_id and patient_id = public.current_patient_id()
    for update;
    if v_appt.id is null then
        raise exception 'Consulta não encontrada.';
    end if;
    if v_appt.date_time <= now() then
        raise exception 'Esta consulta já passou.';
    end if;
    if v_appt.status not in ('pendente', 'confirmado') then
        raise exception 'Esta consulta não pode mais ser alterada pelo app.';
    end if;
    return v_appt;
end;
$$;

create or replace function public.portal_confirm_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments := public.portal_lock_actionable_appointment(p_appointment_id);
begin
    if v_appt.status = 'pendente' then
        update public.appointments set status = 'confirmado' where id = v_appt.id;
    end if;
end;
$$;

create or replace function public.portal_cancel_appointment(p_appointment_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments := public.portal_lock_actionable_appointment(p_appointment_id);
begin
    update public.appointments set status = 'cancelado' where id = v_appt.id;
    update public.appointment_change_requests
    set status = 'cancelado', handled_at = now()
    where appointment_id = v_appt.id and status = 'pendente';
    insert into public.appointment_change_requests (appointment_id, patient_id, clinic_id, kind, note)
    values (v_appt.id, v_appt.patient_id, v_appt.clinic_id, 'cancel', left(nullif(trim(p_note), ''), 500));
end;
$$;

create or replace function public.portal_request_reschedule(
    p_appointment_id uuid, p_preferred_times text, p_note text default null
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_appt public.appointments := public.portal_lock_actionable_appointment(p_appointment_id);
begin
    if nullif(trim(p_preferred_times), '') is null then
        raise exception 'Conte quais dias e horários ficam melhores para você.';
    end if;
    if exists (select 1 from public.appointment_change_requests
               where appointment_id = v_appt.id and status = 'pendente' and kind = 'reschedule') then
        raise exception 'Você já pediu para reagendar esta consulta. Aguarde o retorno da clínica.';
    end if;
    insert into public.appointment_change_requests
        (appointment_id, patient_id, clinic_id, kind, preferred_times, note)
    values (v_appt.id, v_appt.patient_id, v_appt.clinic_id, 'reschedule',
            left(trim(p_preferred_times), 500), left(nullif(trim(p_note), ''), 500));
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Grants
-- ----------------------------------------------------------------------------
revoke execute on function public.current_patient_id()                         from public, anon;
revoke execute on function public.patient_portal_active()                      from public, anon;
revoke execute on function public.portal_lock_actionable_appointment(uuid)     from public, anon, authenticated;
revoke execute on function public.create_patient_account(uuid, text, text, text, text, text, date, text, text, uuid) from public, anon;
revoke execute on function public.create_portal_invite(uuid, timestamptz)      from public, anon;
revoke execute on function public.set_portal_access(uuid, timestamptz)         from public, anon;
revoke execute on function public.get_portal_invite_status(uuid)               from public, anon;
revoke execute on function public.handle_change_request(uuid, text)            from public, anon;
revoke execute on function public.portal_context()                             from public, anon;
revoke execute on function public.portal_accept_terms(text)                    from public, anon;
revoke execute on function public.portal_appointments()                        from public, anon;
revoke execute on function public.portal_confirm_appointment(uuid)             from public, anon;
revoke execute on function public.portal_cancel_appointment(uuid, text)        from public, anon;
revoke execute on function public.portal_request_reschedule(uuid, text, text)  from public, anon;

grant execute on function public.current_patient_id()                          to authenticated;
grant execute on function public.patient_portal_active()                       to authenticated;
grant execute on function public.create_patient_account(uuid, text, text, text, text, text, date, text, text, uuid) to authenticated;
grant execute on function public.create_portal_invite(uuid, timestamptz)       to authenticated;
grant execute on function public.set_portal_access(uuid, timestamptz)          to authenticated;
grant execute on function public.get_portal_invite_status(uuid)                to authenticated;
grant execute on function public.handle_change_request(uuid, text)             to authenticated;
grant execute on function public.portal_context()                              to authenticated;
grant execute on function public.portal_accept_terms(text)                     to authenticated;
grant execute on function public.portal_appointments()                         to authenticated;
grant execute on function public.portal_confirm_appointment(uuid)              to authenticated;
grant execute on function public.portal_cancel_appointment(uuid, text)         to authenticated;
grant execute on function public.portal_request_reschedule(uuid, text, text)   to authenticated;

commit;

-- ============================================================================
-- Rollback (resumo):
--   drop function public.portal_request_reschedule(uuid, text, text), public.portal_cancel_appointment(uuid, text),
--     public.portal_confirm_appointment(uuid), public.portal_lock_actionable_appointment(uuid),
--     public.portal_appointments(), public.portal_accept_terms(text), public.portal_context(),
--     public.handle_change_request(uuid, text), public.get_portal_invite_status(uuid),
--     public.set_portal_access(uuid, timestamptz), public.create_portal_invite(uuid, timestamptz),
--     public.patient_portal_active(), public.current_patient_id();
--   drop table public.appointment_change_requests, public.patient_portal_invites;
--   drop trigger trg_enforce_patient_portal_columns on public.patients;
--   alter table public.patients drop column portal_access_until, drop column portal_terms_accepted_at,
--     drop column portal_terms_version;
--   (create_patient_account antigo, com senha: ver 0029)
-- ============================================================================
