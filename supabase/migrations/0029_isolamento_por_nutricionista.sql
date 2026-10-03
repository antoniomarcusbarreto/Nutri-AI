-- ============================================================================
-- Migration 0029 — Isolamento por nutricionista (Fase 1 da auditoria, 2026-10-03)
-- ============================================================================
--
-- Regras de negócio (decididas pelo dono do produto):
--   * Cada nutricionista — inclusive o dono da clínica — vê só os pacientes
--     pelos quais é RESPONSÁVEL (patients.nutritionist_id), mais os que lhe
--     foram CONCEDIDOS (patient_access_grants).
--   * Concessão: o nutricionista pede e o colega (responsável) aprova; ou o
--     Master da plataforma concede direto. O dono da clínica não concede sozinho.
--   * Master da plataforma: gerencia contas, concessões e transferências, mas
--     NÃO lê dados clínicos.
--   * Secretária: agenda, cadastro básico e financeiro da clínica inteira;
--     nunca prontuário, exames, planos ou ficha de saúde.
--
-- Para a secretária poder ler `patients` sem ver saúde (RLS não filtra coluna),
-- os campos clínicos saem de `patients` e vão para `patient_health` (1:1).
--
-- Front-end correspondente: mesma entrega (usePatients, Consultations,
-- Patients, Settings > Compartilhamento, AdminDashboard). Publicar o front
-- JUNTO com esta migration.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Nutricionista responsável
-- ----------------------------------------------------------------------------
alter table public.patients add column if not exists nutritionist_id uuid references public.profiles(id);

-- Backfill: nutricionista do agendamento mais recente; senão, o dono da clínica.
update public.patients p
set nutritionist_id = coalesce(
    (select a.nutritionist_id from public.appointments a
      where a.patient_id = p.id and a.nutritionist_id is not null
      order by a.date_time desc limit 1),
    (select c.owner_id from public.clinics c where c.id = p.clinic_id)
)
where p.nutritionist_id is null;

alter table public.patients alter column nutritionist_id set not null;
create index if not exists patients_nutritionist_idx on public.patients (clinic_id, nutritionist_id);

-- ----------------------------------------------------------------------------
-- 2. Ficha de saúde separada do cadastro
-- ----------------------------------------------------------------------------
create table if not exists public.patient_health (
    patient_id              uuid primary key references public.patients(id) on delete cascade,
    allergies               text,
    dietary_restrictions    text,
    pathologies             text,
    medications             text,
    physical_activity_level text,
    profession              text,
    sleep_quality           text,
    updated_at              timestamptz not null default now()
);

insert into public.patient_health (patient_id, allergies, dietary_restrictions, pathologies,
                                   medications, physical_activity_level, profession, sleep_quality)
select id, allergies, dietary_restrictions, pathologies, medications,
       physical_activity_level, profession, sleep_quality
from public.patients
on conflict (patient_id) do nothing;

alter table public.patients
    drop column if exists allergies,
    drop column if exists dietary_restrictions,
    drop column if exists pathologies,
    drop column if exists medications,
    drop column if exists physical_activity_level,
    drop column if exists profession,
    drop column if exists sleep_quality;

alter table public.patient_health enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Concessões de acesso (também servem de trilha de auditoria: sem DELETE)
-- ----------------------------------------------------------------------------
create table if not exists public.patient_access_grants (
    id                    uuid primary key default gen_random_uuid(),
    clinic_id             uuid not null references public.clinics(id) on delete cascade,
    owner_nutritionist_id uuid not null references public.profiles(id) on delete cascade,
    grantee_id            uuid not null references public.profiles(id) on delete cascade,
    patient_id            uuid references public.patients(id) on delete cascade, -- null = todos do colega
    status                text not null default 'pending'
                          check (status in ('pending', 'approved', 'denied', 'revoked')),
    reason                text,
    requested_by          uuid references public.profiles(id) on delete set null,
    decided_by            uuid references public.profiles(id) on delete set null,
    expires_at            timestamptz,
    created_at            timestamptz not null default now(),
    decided_at            timestamptz,
    check (owner_nutritionist_id <> grantee_id)
);
create index if not exists patient_access_grants_grantee_idx
    on public.patient_access_grants (grantee_id, owner_nutritionist_id) where status = 'approved';
create index if not exists patient_access_grants_owner_idx
    on public.patient_access_grants (owner_nutritionist_id, status);

alter table public.patient_access_grants enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Helpers (SECURITY DEFINER: leem sem disparar RLS, sem recursão)
-- ----------------------------------------------------------------------------

-- Profissional (owner/nutritionist) ativo da clínica?
create or replace function public.is_clinic_professional(p_clinic_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select public.is_account_active(p_user_id)
       and exists (select 1 from public.clinic_members
                   where clinic_id = p_clinic_id and user_id = p_user_id
                     and role in ('owner', 'nutritionist'));
$$;

-- Acesso CLÍNICO ao paciente: responsável, ou concessão aprovada e vigente.
-- A concessão vale para o responsável ATUAL (transferir o paciente encerra
-- as concessões do responsável anterior).
create or replace function public.can_access_patient(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.patients p
        where p.id = p_patient_id
          and public.acting_member_of(p.clinic_id, array['owner', 'nutritionist'])
          and (
              p.nutritionist_id = auth.uid()
              or exists (
                  select 1 from public.patient_access_grants g
                  where g.clinic_id = p.clinic_id
                    and g.grantee_id = auth.uid()
                    and g.owner_nutritionist_id = p.nutritionist_id
                    and g.status = 'approved'
                    and (g.patient_id is null or g.patient_id = p.id)
                    and (g.expires_at is null or g.expires_at > now())
              )
          )
    );
$$;

-- Campo calculado do PostgREST: `select('*, has_clinical_access')` diz à UI se
-- o usuário vê o prontuário deste paciente ou só o cadastro.
create or replace function public.has_clinical_access(p public.patients)
returns boolean language sql stable security definer set search_path = public
as $$ select public.can_access_patient(p.id); $$;

-- O usuário tem agendamento com o paciente? (vê o CADASTRO, não o prontuário)
create or replace function public.has_appointment_with(p_patient_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
    select exists (select 1 from public.appointments
                   where patient_id = p_patient_id and nutritionist_id = auth.uid());
$$;

-- ----------------------------------------------------------------------------
-- 5. Policies
-- ----------------------------------------------------------------------------

-- patients (só cadastro agora)
drop policy if exists patients_team_all        on public.patients;
drop policy if exists patients_superadmin_all  on public.patients;
drop policy if exists patients_team_select     on public.patients;
drop policy if exists patients_team_insert     on public.patients;
drop policy if exists patients_team_update     on public.patients;

create policy patients_team_select on public.patients for select to authenticated
    using (
        public.can_access_patient(id)
        or public.acting_member_of(clinic_id, array['secretary'])
        or (public.acting_member_of(clinic_id) and public.has_appointment_with(id))
    );

create policy patients_team_insert on public.patients for insert to authenticated
    with check (
        public.is_clinic_professional(clinic_id, nutritionist_id)
        and (nutritionist_id = auth.uid() and public.acting_member_of(clinic_id, array['owner', 'nutritionist'])
             or public.acting_member_of(clinic_id, array['secretary']))
    );

create policy patients_team_update on public.patients for update to authenticated
    using (public.can_access_patient(id) or public.acting_member_of(clinic_id, array['secretary']))
    with check (public.can_access_patient(id) or public.acting_member_of(clinic_id, array['secretary']));

-- Responsável e clínica do paciente só mudam via master_reassign_patient.
create or replace function public.enforce_patient_ownership_columns()
returns trigger language plpgsql set search_path = public
as $$
begin
    if current_user in ('authenticated', 'anon')
       and (new.nutritionist_id is distinct from old.nutritionist_id
            or new.clinic_id is distinct from old.clinic_id) then
        raise exception 'O nutricionista responsável só pode ser alterado pelo suporte.'
            using errcode = '42501';
    end if;
    return new;
end;
$$;
drop trigger if exists trg_enforce_patient_ownership_columns on public.patients;
create trigger trg_enforce_patient_ownership_columns
    before update on public.patients
    for each row execute function public.enforce_patient_ownership_columns();

-- patient_health: só acesso clínico (+ o próprio paciente lê a sua)
drop policy if exists patient_health_clinical_all on public.patient_health;
drop policy if exists patient_health_self_select  on public.patient_health;
create policy patient_health_clinical_all on public.patient_health for all to authenticated
    using (public.can_access_patient(patient_id))
    with check (public.can_access_patient(patient_id));
create policy patient_health_self_select on public.patient_health for select to authenticated
    using (public.is_account_active(auth.uid())
           and exists (select 1 from public.patients p where p.id = patient_id and p.user_id = auth.uid()));

-- consultations / meal_plans: só acesso clínico
drop policy if exists consultations_clinical_all on public.consultations;
create policy consultations_clinical_all on public.consultations for all to authenticated
    using (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id))
    with check (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id));

drop policy if exists meal_plans_team_all     on public.meal_plans;
drop policy if exists meal_plans_clinical_all on public.meal_plans;
create policy meal_plans_clinical_all on public.meal_plans for all to authenticated
    using (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id))
    with check (public.can_access_patient(patient_id) and public.patient_in_clinic(patient_id, clinic_id));

-- patient_exams: só acesso clínico; Master perde a leitura
drop policy if exists patient_exams_team_all       on public.patient_exams;
drop policy if exists patient_exams_superadmin_all on public.patient_exams;
drop policy if exists patient_exams_clinical_all   on public.patient_exams;
create policy patient_exams_clinical_all on public.patient_exams for all to authenticated
    using (public.can_access_patient(patient_id))
    with check (public.can_access_patient(patient_id));

-- appointments: secretária vê/gerencia tudo; profissional vê os seus e os dos
-- pacientes que acessa; o profissional da consulta tem de ser da clínica.
drop policy if exists appointments_team_all    on public.appointments;
drop policy if exists appointments_team_select on public.appointments;
drop policy if exists appointments_team_write  on public.appointments;
drop policy if exists appointments_team_update on public.appointments;
drop policy if exists appointments_team_delete on public.appointments;

create policy appointments_team_select on public.appointments for select to authenticated
    using (
        public.acting_member_of(clinic_id)
        and (public.acting_member_of(clinic_id, array['secretary'])
             or nutritionist_id = auth.uid()
             or public.can_access_patient(patient_id))
    );

create policy appointments_team_write on public.appointments for insert to authenticated
    with check (
        public.patient_in_clinic(patient_id, clinic_id)
        and public.is_clinic_professional(clinic_id, nutritionist_id)
        and (public.acting_member_of(clinic_id, array['secretary']) or public.can_access_patient(patient_id))
    );

create policy appointments_team_update on public.appointments for update to authenticated
    using (
        public.acting_member_of(clinic_id)
        and (public.acting_member_of(clinic_id, array['secretary'])
             or nutritionist_id = auth.uid()
             or public.can_access_patient(patient_id))
    )
    with check (
        public.patient_in_clinic(patient_id, clinic_id)
        and public.is_clinic_professional(clinic_id, nutritionist_id)
        and (public.acting_member_of(clinic_id, array['secretary'])
             or nutritionist_id = auth.uid()
             or public.can_access_patient(patient_id))
    );

create policy appointments_team_delete on public.appointments for delete to authenticated
    using (
        public.acting_member_of(clinic_id)
        and (public.acting_member_of(clinic_id, array['secretary'])
             or nutritionist_id = auth.uid()
             or public.can_access_patient(patient_id))
    );

-- appointment_reschedules: segue a visibilidade do agendamento (RLS da subquery)
drop policy if exists appointment_reschedules_team_all on public.appointment_reschedules;
create policy appointment_reschedules_team_all on public.appointment_reschedules for all to authenticated
    using (exists (select 1 from public.appointments a where a.id = appointment_id))
    with check (exists (select 1 from public.appointments a where a.id = appointment_id));

-- payments: dono e secretária veem a clínica; profissional vê os próprios e
-- os dos pacientes que acessa.
drop policy if exists payments_team_select    on public.payments;
drop policy if exists payments_team_insert    on public.payments;
drop policy if exists payments_team_update    on public.payments;
drop policy if exists payments_clinical_delete on public.payments;
drop policy if exists payments_team_delete    on public.payments;

create policy payments_team_select on public.payments for select to authenticated
    using (
        public.acting_member_of(clinic_id, array['owner', 'secretary'])
        or (public.acting_member_of(clinic_id)
            and (nutritionist_id = auth.uid() or public.can_access_patient(patient_id)))
    );

create policy payments_team_insert on public.payments for insert to authenticated
    with check (
        public.patient_in_clinic(patient_id, clinic_id)
        and (public.acting_member_of(clinic_id, array['owner', 'secretary'])
             or (public.acting_member_of(clinic_id)
                 and (nutritionist_id = auth.uid() or public.can_access_patient(patient_id))))
    );

create policy payments_team_update on public.payments for update to authenticated
    using (
        public.acting_member_of(clinic_id, array['owner', 'secretary'])
        or (public.acting_member_of(clinic_id)
            and (nutritionist_id = auth.uid() or public.can_access_patient(patient_id)))
    )
    with check (
        public.patient_in_clinic(patient_id, clinic_id)
        and (public.acting_member_of(clinic_id, array['owner', 'secretary'])
             or (public.acting_member_of(clinic_id)
                 and (nutritionist_id = auth.uid() or public.can_access_patient(patient_id))))
    );

create policy payments_team_delete on public.payments for delete to authenticated
    using (
        public.acting_member_of(clinic_id, array['owner'])
        or (public.acting_member_of(clinic_id, array['nutritionist']) and nutritionist_id = auth.uid())
    );

-- expenses: custos da clínica — dono e secretária
drop policy if exists expenses_clinical_all on public.expenses;
drop policy if exists expenses_admin_all    on public.expenses;
create policy expenses_admin_all on public.expenses for all to authenticated
    using (public.acting_member_of(clinic_id, array['owner', 'secretary']))
    with check (public.acting_member_of(clinic_id, array['owner', 'secretary']));

-- patient_access_grants: leitura para as partes envolvidas e o Master;
-- escrita só pelas RPCs abaixo.
drop policy if exists patient_access_grants_parties_select on public.patient_access_grants;
create policy patient_access_grants_parties_select on public.patient_access_grants for select to authenticated
    using (grantee_id = auth.uid() or owner_nutritionist_id = auth.uid() or public.is_superadmin(auth.uid()));

-- Storage exams-bucket: só acesso clínico; Master perde a leitura
drop policy if exists "Superadmins podem gerenciar todos os exames no storage" on storage.objects;
drop policy if exists "Membros da clinica podem ver exames"     on storage.objects;
drop policy if exists "Membros da clinica podem enviar exames"  on storage.objects;
drop policy if exists "Membros da clinica podem deletar exames" on storage.objects;

create policy "Membros da clinica podem ver exames" on storage.objects for select to authenticated
    using (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));
create policy "Membros da clinica podem enviar exames" on storage.objects for insert to authenticated
    with check (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));
create policy "Membros da clinica podem deletar exames" on storage.objects for delete to authenticated
    using (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1) and public.can_access_patient(p.id)));

-- ----------------------------------------------------------------------------
-- 6. RPCs de pacientes
-- ----------------------------------------------------------------------------

-- Novo parâmetro p_nutritionist_id (o antigo create_patient_account de 10
-- argumentos é removido para não haver ambiguidade no PostgREST).
drop function if exists public.create_patient_account(uuid, text, text, text, text, text, text, date, text, text);
create or replace function public.create_patient_account(
    p_clinic_id uuid, p_name text, p_cpf text, p_email text, p_phone text,
    p_status text, p_password text, p_birth_date date, p_biological_sex text, p_main_goal text,
    p_nutritionist_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare
    v_user_id uuid;
    v_email text := lower(trim(p_email));
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

    select id into v_user_id from auth.users where lower(email) = v_email limit 1;

    if v_user_id is null then
        v_user_id := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) values (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
            v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', ''
        );
        insert into public.profiles (id, full_name, phone) values (v_user_id, p_name, p_phone)
        on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;
    elsif not public.is_patient_only_of_clinic(v_user_id, p_clinic_id) then
        raise exception 'Este e-mail já está em uso por outra conta. Use outro e-mail para o paciente.' using errcode = '23505';
    end if;

    select id into v_patient_id from public.patients where clinic_id = p_clinic_id and user_id = v_user_id;

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
        insert into public.patients (clinic_id, user_id, nutritionist_id, name, cpf, email, phone,
                                     status, birth_date, biological_sex, main_goal)
        values (p_clinic_id, v_user_id, v_responsible, p_name, p_cpf, v_email, p_phone,
                p_status, p_birth_date, p_biological_sex, p_main_goal)
        returning id into v_patient_id;
        insert into public.patient_health (patient_id) values (v_patient_id) on conflict do nothing;
    end if;

    return v_user_id;
end;
$$;

create or replace function public.update_patient_account(
    p_clinic_id uuid, p_patient_id uuid, p_name text, p_cpf text, p_email text, p_phone text,
    p_status text, p_birth_date date, p_biological_sex text, p_main_goal text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_user_id uuid;
begin
    if not public.patient_in_clinic(p_patient_id, p_clinic_id)
       or not (public.can_access_patient(p_patient_id) or public.acting_member_of(p_clinic_id, array['secretary'])) then
        raise exception 'Acesso negado a este paciente.' using errcode = '42501';
    end if;

    select user_id into v_user_id from public.patients where id = p_patient_id;

    update public.patients
    set name = p_name, cpf = p_cpf, email = p_email, phone = p_phone, status = p_status,
        birth_date = p_birth_date, biological_sex = p_biological_sex, main_goal = p_main_goal
    where id = p_patient_id and clinic_id = p_clinic_id;

    -- Nome/telefone da conta de login; e-mail de login NÃO muda aqui (SEC-03).
    if v_user_id is not null and public.is_patient_only_of_clinic(v_user_id, p_clinic_id) then
        update public.profiles set full_name = p_name, phone = p_phone where id = v_user_id;
    end if;
end;
$$;

-- Senha / status da conta do paciente: só quem tem acesso clínico a ele.
create or replace function public.change_patient_password(p_patient_user_id uuid, p_new_password text)
returns boolean language plpgsql security definer set search_path = public, extensions
as $$
declare
    v_clinic_id uuid;
    v_patient_id uuid;
begin
    select clinic_id, id into v_clinic_id, v_patient_id from public.patients where user_id = p_patient_user_id limit 1;
    if v_patient_id is null
       or not public.can_access_patient(v_patient_id)
       or not public.is_patient_only_of_clinic(p_patient_user_id, v_clinic_id) then
        raise exception 'Acesso negado. Apenas o nutricionista do paciente pode alterar a senha.' using errcode = '42501';
    end if;
    if p_new_password is null or length(p_new_password) < 8 then
        raise exception 'A senha deve ter pelo menos 8 caracteres.';
    end if;
    update auth.users
    set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')), updated_at = now()
    where id = p_patient_user_id;
    return true;
end;
$$;

create or replace function public.toggle_patient_status(p_patient_user_id uuid, p_is_active boolean)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
    v_clinic_id uuid;
    v_patient_id uuid;
begin
    select clinic_id, id into v_clinic_id, v_patient_id from public.patients where user_id = p_patient_user_id limit 1;
    if v_patient_id is null
       or not public.can_access_patient(v_patient_id)
       or not public.is_patient_only_of_clinic(p_patient_user_id, v_clinic_id) then
        raise exception 'Acesso negado. Apenas o nutricionista do paciente pode gerenciar o acesso.' using errcode = '42501';
    end if;
    update public.profiles set is_active = p_is_active where id = p_patient_user_id;
    return true;
end;
$$;

-- Ficha pré-consulta pública: agora em patient_health.
create or replace function public.get_patient_by_token(p_token uuid)
returns table(name text, allergies text, dietary_restrictions text, pathologies text, medications text,
              physical_activity_level text, profession text, sleep_quality text)
language plpgsql security definer set search_path = public
as $$
begin
    perform public.enforce_public_rate_limit('patient_token:' || public.client_ip(), 20, interval '10 minutes');
    return query
    select p.name, h.allergies, h.dietary_restrictions, h.pathologies, h.medications,
           h.physical_activity_level, h.profession, h.sleep_quality
    from public.patients p
    left join public.patient_health h on h.patient_id = p.id
    where p.form_token = p_token
    limit 1;
end;
$$;

create or replace function public.update_patient_clinical_data(
    p_token uuid, p_allergies text, p_dietary_restrictions text, p_pathologies text,
    p_medications text, p_physical_activity_level text, p_profession text, p_sleep_quality text
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
    v_patient_id uuid;
begin
    perform public.enforce_public_rate_limit('patient_form_write:' || public.client_ip(), 10, interval '10 minutes');
    select id into v_patient_id from public.patients where form_token = p_token limit 1;
    if v_patient_id is null then
        return false;
    end if;
    insert into public.patient_health (patient_id, allergies, dietary_restrictions, pathologies, medications,
                                       physical_activity_level, profession, sleep_quality, updated_at)
    values (v_patient_id, p_allergies, p_dietary_restrictions, p_pathologies, p_medications,
            p_physical_activity_level, p_profession, p_sleep_quality, now())
    on conflict (patient_id) do update set
        allergies = excluded.allergies, dietary_restrictions = excluded.dietary_restrictions,
        pathologies = excluded.pathologies, medications = excluded.medications,
        physical_activity_level = excluded.physical_activity_level,
        profession = excluded.profession, sleep_quality = excluded.sleep_quality, updated_at = now();
    return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPCs de concessão de acesso
-- ----------------------------------------------------------------------------

-- Nutricionista pede acesso aos pacientes de um colega (todos ou um).
create or replace function public.request_patient_access(
    p_owner_nutritionist_id uuid, p_patient_id uuid default null, p_reason text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_clinic_id uuid;
    v_id uuid;
begin
    select clinic_id into v_clinic_id from public.clinic_members
    where user_id = auth.uid() and role in ('owner', 'nutritionist') limit 1;

    if v_clinic_id is null or not public.is_clinic_professional(v_clinic_id, auth.uid()) then
        raise exception 'Apenas nutricionistas podem solicitar acesso.' using errcode = '42501';
    end if;
    if p_owner_nutritionist_id = auth.uid() then
        raise exception 'Você já tem acesso aos seus próprios pacientes.';
    end if;
    if not public.is_clinic_professional(v_clinic_id, p_owner_nutritionist_id) then
        raise exception 'Este profissional não é nutricionista ativo da sua clínica.';
    end if;
    if p_patient_id is not null and not exists (
        select 1 from public.patients
        where id = p_patient_id and clinic_id = v_clinic_id and nutritionist_id = p_owner_nutritionist_id
    ) then
        raise exception 'Paciente não pertence a este nutricionista.';
    end if;
    if exists (
        select 1 from public.patient_access_grants
        where grantee_id = auth.uid() and owner_nutritionist_id = p_owner_nutritionist_id
          and patient_id is not distinct from p_patient_id and status = 'pending'
    ) then
        raise exception 'Já existe um pedido pendente igual a este.';
    end if;

    insert into public.patient_access_grants (clinic_id, owner_nutritionist_id, grantee_id, patient_id,
                                              status, reason, requested_by)
    values (v_clinic_id, p_owner_nutritionist_id, auth.uid(), p_patient_id, 'pending', p_reason, auth.uid())
    returning id into v_id;
    return v_id;
end;
$$;

-- O responsável pelos pacientes aprova ou nega (com validade opcional).
create or replace function public.decide_patient_access(p_grant_id uuid, p_approve boolean, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
    g public.patient_access_grants;
begin
    select * into g from public.patient_access_grants where id = p_grant_id for update;
    if g.id is null or g.owner_nutritionist_id <> auth.uid() or not public.is_clinic_professional(g.clinic_id, auth.uid()) then
        raise exception 'Apenas o nutricionista responsável pelos pacientes pode decidir este pedido.' using errcode = '42501';
    end if;
    if g.status <> 'pending' then
        raise exception 'Este pedido já foi decidido.';
    end if;
    if p_expires_at is not null and p_expires_at <= now() then
        raise exception 'A validade precisa ser uma data futura.';
    end if;

    update public.patient_access_grants
    set status = case when p_approve then 'approved' else 'denied' end,
        expires_at = case when p_approve then p_expires_at else null end,
        decided_by = auth.uid(), decided_at = now()
    where id = p_grant_id;
end;
$$;

-- Revogar: o responsável, o próprio beneficiado (abrir mão) ou o Master.
create or replace function public.revoke_patient_access(p_grant_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
    g public.patient_access_grants;
begin
    select * into g from public.patient_access_grants where id = p_grant_id for update;
    if g.id is null
       or not (g.owner_nutritionist_id = auth.uid() or g.grantee_id = auth.uid() or public.is_superadmin(auth.uid())) then
        raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    if g.status not in ('approved', 'pending') then
        raise exception 'Este acesso já está encerrado.';
    end if;
    update public.patient_access_grants
    set status = 'revoked', decided_by = auth.uid(), decided_at = now()
    where id = p_grant_id;
end;
$$;

-- Master concede direto (sem passar pelo responsável).
create or replace function public.master_grant_patient_access(
    p_owner_nutritionist_id uuid, p_grantee_id uuid, p_patient_id uuid default null,
    p_expires_at timestamptz default null, p_reason text default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
    v_clinic_id uuid;
    v_id uuid;
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Apenas o Master pode conceder acesso diretamente.' using errcode = '42501';
    end if;
    select clinic_id into v_clinic_id from public.clinic_members
    where user_id = p_owner_nutritionist_id and role in ('owner', 'nutritionist') limit 1;
    if v_clinic_id is null
       or not exists (select 1 from public.clinic_members
                      where clinic_id = v_clinic_id and user_id = p_grantee_id and role in ('owner', 'nutritionist')) then
        raise exception 'Os dois profissionais precisam ser nutricionistas da mesma clínica.';
    end if;
    if p_owner_nutritionist_id = p_grantee_id then
        raise exception 'Escolha dois profissionais diferentes.';
    end if;
    if p_patient_id is not null and not exists (
        select 1 from public.patients where id = p_patient_id and nutritionist_id = p_owner_nutritionist_id
    ) then
        raise exception 'Paciente não pertence a este nutricionista.';
    end if;

    insert into public.patient_access_grants (clinic_id, owner_nutritionist_id, grantee_id, patient_id, status,
                                              reason, requested_by, decided_by, expires_at, decided_at)
    values (v_clinic_id, p_owner_nutritionist_id, p_grantee_id, p_patient_id, 'approved',
            coalesce(p_reason, 'Concedido pelo suporte (Master)'), auth.uid(), auth.uid(), p_expires_at, now())
    returning id into v_id;
    return v_id;
end;
$$;

-- Master transfere o paciente (ex.: nutricionista saiu da clínica).
create or replace function public.master_reassign_patient(p_patient_id uuid, p_new_nutritionist_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_clinic_id uuid;
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Apenas o Master pode transferir pacientes.' using errcode = '42501';
    end if;
    select clinic_id into v_clinic_id from public.patients where id = p_patient_id;
    if v_clinic_id is null then
        raise exception 'Paciente não encontrado.';
    end if;
    if not exists (select 1 from public.clinic_members
                   where clinic_id = v_clinic_id and user_id = p_new_nutritionist_id and role in ('owner', 'nutritionist')) then
        raise exception 'O novo responsável precisa ser nutricionista da mesma clínica.';
    end if;
    update public.patients set nutritionist_id = p_new_nutritionist_id where id = p_patient_id;
end;
$$;

-- Lista de concessões com nomes, para as telas (partes envolvidas ou Master).
-- O nome do paciente só aparece para quem já tem direito de vê-lo (o
-- responsável, o beneficiado de concessão aprovada, ou o Master).
create or replace function public.list_patient_access_grants()
returns table(
    id uuid, clinic_id uuid, status text, reason text, expires_at timestamptz,
    created_at timestamptz, decided_at timestamptz,
    owner_nutritionist_id uuid, owner_name text,
    grantee_id uuid, grantee_name text,
    patient_id uuid, patient_name text
)
language sql stable security definer set search_path = public
as $$
    select g.id, g.clinic_id,
           case when g.status = 'approved' and g.expires_at is not null and g.expires_at <= now()
                then 'expired' else g.status end,
           g.reason, g.expires_at, g.created_at, g.decided_at,
           g.owner_nutritionist_id, po.full_name,
           g.grantee_id, pg.full_name,
           g.patient_id,
           case when g.patient_id is null then null
                when g.owner_nutritionist_id = auth.uid() or public.is_superadmin(auth.uid())
                     or g.status = 'approved' or g.requested_by = auth.uid()
                then pt.name end
    from public.patient_access_grants g
    join public.profiles po on po.id = g.owner_nutritionist_id
    join public.profiles pg on pg.id = g.grantee_id
    left join public.patients pt on pt.id = g.patient_id
    where (g.grantee_id = auth.uid() or g.owner_nutritionist_id = auth.uid() or public.is_superadmin(auth.uid()))
      and public.is_account_active(auth.uid())
    order by g.created_at desc;
$$;

-- Pacientes do colega que eu já vejo (agendamento comigo) mas não acesso,
-- para pedir acesso a um paciente específico.
create or replace function public.list_requestable_patients()
returns table(patient_id uuid, patient_name text, owner_nutritionist_id uuid, owner_name text)
language sql stable security definer set search_path = public
as $$
    select p.id, p.name, p.nutritionist_id, pr.full_name
    from public.patients p
    join public.profiles pr on pr.id = p.nutritionist_id
    where p.nutritionist_id <> auth.uid()
      and public.acting_member_of(p.clinic_id, array['owner', 'nutritionist'])
      and public.has_appointment_with(p.id)
      and not public.can_access_patient(p.id)
    order by p.name;
$$;

-- Painel Master: só o vínculo paciente → clínica (sem cadastro nem saúde).
create or replace function public.admin_patient_links()
returns table(user_id uuid, clinic_id uuid, clinic_name text)
language plpgsql stable security definer set search_path = public
as $$
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    return query
    select p.user_id, p.clinic_id, c.name
    from public.patients p join public.clinics c on c.id = p.clinic_id
    where p.user_id is not null;
end;
$$;

-- Painel Master: pacientes de uma clínica para transferência/concessão —
-- apenas nome e responsável (mínimo para identificar; sem dado de saúde).
create or replace function public.admin_list_clinic_patients(p_clinic_id uuid)
returns table(patient_id uuid, patient_name text, nutritionist_id uuid, nutritionist_name text)
language plpgsql stable security definer set search_path = public
as $$
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Acesso negado.' using errcode = '42501';
    end if;
    return query
    select p.id, p.name, p.nutritionist_id, pr.full_name
    from public.patients p join public.profiles pr on pr.id = p.nutritionist_id
    where p.clinic_id = p_clinic_id
    order by p.name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Grants (a 0028 tirou o default de PUBLIC/anon)
-- ----------------------------------------------------------------------------
-- Tabelas novas: nada para anon; authenticated sujeito às policies acima
-- (patient_access_grants não tem policy de escrita: só as RPCs gravam).
revoke all on public.patient_health, public.patient_access_grants from anon;
grant select, insert, update, delete on public.patient_health to authenticated;
grant select on public.patient_access_grants to authenticated;

revoke execute on all functions in schema public from public, anon;

grant execute on function public.get_patient_by_token(uuid) to anon, authenticated;
grant execute on function public.update_patient_clinical_data(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_patient_meal_plan(uuid, date) to anon, authenticated;
grant execute on function public.get_appointment_details_public(uuid) to anon, authenticated;
grant execute on function public.confirm_appointment_public(uuid, text) to anon, authenticated;

grant execute on function public.is_clinic_professional(uuid, uuid) to authenticated;
grant execute on function public.can_access_patient(uuid) to authenticated;
grant execute on function public.has_appointment_with(uuid) to authenticated;
grant execute on function public.has_clinical_access(public.patients) to authenticated;
grant execute on function public.create_patient_account(uuid, text, text, text, text, text, text, date, text, text, uuid) to authenticated;
grant execute on function public.update_patient_account(uuid, uuid, text, text, text, text, text, date, text, text) to authenticated;
grant execute on function public.change_patient_password(uuid, text) to authenticated;
grant execute on function public.toggle_patient_status(uuid, boolean) to authenticated;
grant execute on function public.request_patient_access(uuid, uuid, text) to authenticated;
grant execute on function public.decide_patient_access(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.revoke_patient_access(uuid) to authenticated;
grant execute on function public.master_grant_patient_access(uuid, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.master_reassign_patient(uuid, uuid) to authenticated;
grant execute on function public.list_patient_access_grants() to authenticated;
grant execute on function public.list_requestable_patients() to authenticated;
grant execute on function public.admin_patient_links() to authenticated;
grant execute on function public.admin_list_clinic_patients(uuid) to authenticated;

commit;
