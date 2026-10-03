-- ============================================================================
-- Migration 0028 — Fase 0 da auditoria de isolamento (2026-10-03)
-- ============================================================================
--
-- Auditoria direto no banco de produção revelou que a 0018 nunca foi aplicada
-- (e as 0015–0024/0027 foram aplicadas fora do histórico, parcialmente). Esta
-- migration é idempotente e fecha as brechas exploráveis hoje, sem mudar regra
-- de negócio para o usuário legítimo:
--
--   1. profiles: qualquer usuário (até paciente) virava Master com
--      update/insert de is_superadmin. Trigger agora cobre INSERT e UPDATE.
--   2. clinics: o dono editava plan_level / subscription_* / owner_id (bypass
--      de cobrança) e qualquer usuário criava clínica. Criação passa pela RPC
--      create_my_clinic.
--   3. clinic_members: escrita direta removida (só RPCs).
--   4. create_patient_account / change_patient_password / toggle_patient_status:
--      vincular um e-mail já existente (staff de outra clínica, Master) como
--      paciente permitia trocar a senha / bloquear a conta da vítima.
--   5. create/delete/toggle/update_staff_member: mesma "adoção" de contas alheias.
--   6. Storage exams-bucket: exigia só membership, não conta ativa.
--   7. EXECUTE revogado de PUBLIC/anon nas funções internas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 0. Helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_superadmin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = user_id and is_superadmin = true
    );
$$;

-- true quando p_user_id é SOMENTE paciente, e somente da clínica p_clinic_id:
-- não é superadmin, não é membro de equipe e não é paciente de outra clínica.
-- É a condição para o dono/nutricionista mexer na conta de login do usuário.
create or replace function public.is_patient_only_of_clinic(p_user_id uuid, p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.patients where user_id = p_user_id and clinic_id = p_clinic_id)
       and not exists (select 1 from public.patients where user_id = p_user_id and clinic_id <> p_clinic_id)
       and not exists (select 1 from public.clinic_members where user_id = p_user_id)
       and not public.is_superadmin(p_user_id);
$$;

-- ----------------------------------------------------------------------------
-- 1. profiles: colunas privilegiadas (reaplica 0018, agora cobrindo INSERT)
-- ----------------------------------------------------------------------------
create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user in ('authenticated', 'anon') then
        if tg_op = 'INSERT' then
            new.is_superadmin := false;
            new.is_active := true;
        else
            if new.is_superadmin is distinct from old.is_superadmin then
                raise exception 'Alteração de is_superadmin não é permitida.'
                    using errcode = '42501';
            end if;
            if new.is_active is distinct from old.is_active then
                raise exception 'Alteração de is_active não é permitida por este canal.'
                    using errcode = '42501';
            end if;
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_profile_privileged_columns on public.profiles;
create trigger trg_enforce_profile_privileged_columns
    before insert or update on public.profiles
    for each row execute function public.enforce_profile_privileged_columns();

drop policy if exists "Usuários gerenciam o próprio perfil"               on public.profiles;
drop policy if exists "Usuários leem seus profiles e equipe leem"         on public.profiles;
drop policy if exists "Superadmins gerenciam todos os perfis"             on public.profiles;
drop policy if exists "Equipe da clinica le profiles de outros membros"   on public.profiles;
drop policy if exists "Equipe da clinica le profiles dos pacientes"       on public.profiles;
drop policy if exists profiles_select        on public.profiles;
drop policy if exists profiles_insert_self   on public.profiles;
drop policy if exists profiles_update_self   on public.profiles;
drop policy if exists profiles_superadmin_all on public.profiles;

create policy profiles_select
    on public.profiles for select
    to authenticated
    using (
        id = auth.uid()
        or (public.is_account_active(auth.uid())
            and (public.is_member_of_same_clinic(profiles.id, auth.uid())
                 or public.is_patient_of_clinic(profiles.id, auth.uid())))
        or public.is_superadmin(auth.uid())
    );

create policy profiles_insert_self
    on public.profiles for insert
    to authenticated
    with check (id = auth.uid());

create policy profiles_update_self
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Master gerencia contas (nome, status). O trigger de último Master (0027)
-- continua valendo; dados clínicos NÃO estão em profiles.
create policy profiles_superadmin_all
    on public.profiles for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 2. clinics: plano/assinatura/dono só via Master; criação só via RPC
-- ----------------------------------------------------------------------------
create or replace function public.enforce_clinic_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user in ('authenticated', 'anon') and not public.is_superadmin(auth.uid()) then
        if new.owner_id is distinct from old.owner_id
           or new.plan_level is distinct from old.plan_level
           or new.subscription_status is distinct from old.subscription_status
           or new.subscription_end_date is distinct from old.subscription_end_date then
            raise exception 'Plano, assinatura e titularidade da clínica só podem ser alterados pelo suporte.'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_clinic_privileged_columns on public.clinics;
create trigger trg_enforce_clinic_privileged_columns
    before update on public.clinics
    for each row execute function public.enforce_clinic_privileged_columns();

drop policy if exists clinics_insert_own on public.clinics;
drop policy if exists "Superadmins gerenciam todas as clinicas" on public.clinics;
create policy "Superadmins gerenciam todas as clinicas"
    on public.clinics for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- Cria a clínica e o vínculo de owner numa transação só. Regra: uma clínica
-- por usuário, e paciente não vira dono de clínica.
create or replace function public.create_my_clinic(
    p_name text, p_cep text, p_address text, p_neighborhood text, p_city text,
    p_state text, p_complement text, p_operating_hours text, p_email text, p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clinic_id uuid;
begin
    if auth.uid() is null or not public.is_account_active(auth.uid()) then
        raise exception 'Conta inativa ou não autenticada.' using errcode = '42501';
    end if;
    if exists (select 1 from public.clinic_members where user_id = auth.uid()) then
        raise exception 'Você já faz parte de uma clínica.' using errcode = '42501';
    end if;
    if exists (select 1 from public.patients where user_id = auth.uid()) then
        raise exception 'Contas de paciente não podem criar clínicas.' using errcode = '42501';
    end if;

    insert into public.clinics (owner_id, name, plan_level, cep, address, neighborhood,
                                city, state, complement, operating_hours, email, phone)
    values (auth.uid(), p_name, 'starter', p_cep, p_address, p_neighborhood,
            p_city, p_state, p_complement, p_operating_hours, p_email, p_phone)
    returning id into v_clinic_id;

    insert into public.clinic_members (clinic_id, user_id, role)
    values (v_clinic_id, auth.uid(), 'owner');

    return v_clinic_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. clinic_members: sem escrita direta (create/update/delete_staff_member,
--    allocate_user_to_clinic e create_my_clinic cobrem os casos)
-- ----------------------------------------------------------------------------
drop policy if exists clinic_members_owner_insert on public.clinic_members;
drop policy if exists clinic_members_owner_update on public.clinic_members;
drop policy if exists clinic_members_owner_delete on public.clinic_members;
drop policy if exists "Superadmins veem todos os membros" on public.clinic_members;
create policy "Superadmins veem todos os membros"
    on public.clinic_members for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. Contas de paciente
-- ----------------------------------------------------------------------------
create or replace function public.create_patient_account(
    p_clinic_id uuid, p_name text, p_cpf text, p_email text, p_phone text,
    p_status text, p_password text, p_birth_date date, p_biological_sex text, p_main_goal text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid;
    v_email text := lower(trim(p_email));
begin
    if not public.acting_member_of(p_clinic_id) then
        raise exception 'Acesso negado. Apenas equipe autorizada pode cadastrar pacientes.'
            using errcode = '42501';
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

        insert into public.profiles (id, full_name, phone)
        values (v_user_id, p_name, p_phone)
        on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone;
    elsif not public.is_patient_only_of_clinic(v_user_id, p_clinic_id) then
        -- E-mail pertence a outra pessoa (equipe, Master ou paciente de outra
        -- clínica). Vincular daria a esta clínica poder sobre a conta dela.
        raise exception 'Este e-mail já está em uso por outra conta. Use outro e-mail para o paciente.'
            using errcode = '23505';
    end if;

    if exists (select 1 from public.patients where clinic_id = p_clinic_id and user_id = v_user_id) then
        update public.patients
        set name = p_name, cpf = p_cpf, phone = p_phone, status = p_status,
            birth_date = p_birth_date, biological_sex = p_biological_sex, main_goal = p_main_goal
        where clinic_id = p_clinic_id and user_id = v_user_id;
    else
        insert into public.patients (clinic_id, user_id, name, cpf, email, phone, status,
                                     birth_date, biological_sex, main_goal)
        values (p_clinic_id, v_user_id, p_name, p_cpf, v_email, p_phone, p_status,
                p_birth_date, p_biological_sex, p_main_goal);
    end if;

    return v_user_id;
end;
$$;

create or replace function public.change_patient_password(p_patient_user_id uuid, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_clinic_id uuid;
begin
    select clinic_id into v_clinic_id from public.patients where user_id = p_patient_user_id limit 1;

    if v_clinic_id is null
       or not public.acting_member_of(v_clinic_id, array['owner', 'nutritionist'])
       or not public.is_patient_only_of_clinic(p_patient_user_id, v_clinic_id) then
        raise exception 'Acesso negado. Apenas profissionais da clínica do paciente podem alterar a senha.'
            using errcode = '42501';
    end if;

    if p_new_password is null or length(p_new_password) < 8 then
        raise exception 'A senha deve ter pelo menos 8 caracteres.';
    end if;

    update auth.users
    set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    where id = p_patient_user_id;

    return true;
end;
$$;

create or replace function public.toggle_patient_status(p_patient_user_id uuid, p_is_active boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clinic_id uuid;
begin
    select clinic_id into v_clinic_id from public.patients where user_id = p_patient_user_id limit 1;

    if v_clinic_id is null
       or not public.acting_member_of(v_clinic_id, array['owner', 'nutritionist'])
       or not public.is_patient_only_of_clinic(p_patient_user_id, v_clinic_id) then
        raise exception 'Acesso negado. Apenas profissionais da clínica do paciente podem gerenciar o acesso.'
            using errcode = '42501';
    end if;

    update public.profiles set is_active = p_is_active where id = p_patient_user_id;
    return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Equipe
-- ----------------------------------------------------------------------------
create or replace function public.create_staff_member(
    p_clinic_id uuid, p_name text, p_email text, p_phone text, p_crn text, p_role text, p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_user_id uuid;
    v_email text := lower(trim(p_email));
begin
    if not public.acting_member_of(p_clinic_id, array['owner']) then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.'
            using errcode = '42501';
    end if;

    if p_role not in ('nutritionist', 'secretary') then
        raise exception 'Papel inválido. Deve ser nutritionist ou secretary.';
    end if;

    if exists (select 1 from auth.users where lower(email) = v_email) then
        -- Reaproveitar a conta daria ao dono poder de bloquear/apagar o login
        -- de alguém de outra clínica, de um paciente ou do Master.
        raise exception 'Este e-mail já está cadastrado na plataforma. Use outro e-mail.'
            using errcode = '23505';
    end if;

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

    insert into public.profiles (id, full_name, phone, crn, is_active)
    values (v_user_id, p_name, p_phone, p_crn, true)
    on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone, crn = excluded.crn;

    insert into public.clinic_members (clinic_id, user_id, role)
    values (p_clinic_id, v_user_id, p_role);

    return v_user_id;
end;
$$;

-- Alvo precisa ser equipe (não owner) DESTA clínica e não pode ser Master.
create or replace function public.assert_manageable_staff(p_clinic_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.acting_member_of(p_clinic_id, array['owner']) then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.'
            using errcode = '42501';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'Use "Meu Perfil" para alterar seus próprios dados.';
    end if;
    if not exists (
        select 1 from public.clinic_members
        where clinic_id = p_clinic_id and user_id = p_user_id and role in ('nutritionist', 'secretary')
    ) or public.is_superadmin(p_user_id) then
        raise exception 'Usuário não pertence à equipe desta clínica.' using errcode = '42501';
    end if;
end;
$$;

create or replace function public.update_staff_member(
    p_clinic_id uuid, p_user_id uuid, p_name text, p_email text, p_phone text, p_crn text, p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.assert_manageable_staff(p_clinic_id, p_user_id);

    if p_role not in ('nutritionist', 'secretary') then
        raise exception 'Papel inválido. Deve ser nutritionist ou secretary.';
    end if;

    update public.profiles set full_name = p_name, phone = p_phone, crn = p_crn where id = p_user_id;
    update public.clinic_members set role = p_role where clinic_id = p_clinic_id and user_id = p_user_id;
end;
$$;

create or replace function public.toggle_staff_member_status(p_clinic_id uuid, p_user_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.assert_manageable_staff(p_clinic_id, p_user_id);
    update public.profiles set is_active = p_is_active where id = p_user_id;
end;
$$;

create or replace function public.delete_staff_member(p_clinic_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.assert_manageable_staff(p_clinic_id, p_user_id);

    delete from public.clinic_members where clinic_id = p_clinic_id and user_id = p_user_id;

    -- Só apaga o login se a pessoa não tiver mais nenhum vínculo.
    if not exists (select 1 from public.clinic_members where user_id = p_user_id)
       and not exists (select 1 from public.patients where user_id = p_user_id) then
        delete from public.profiles where id = p_user_id;
        delete from auth.users where id = p_user_id;
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Storage exams-bucket: exigir conta ativa
--    (a regra por nutricionista responsável entra na 0029)
-- ----------------------------------------------------------------------------
drop policy if exists "Membros da clinica podem ver exames"     on storage.objects;
drop policy if exists "Membros da clinica podem enviar exames"  on storage.objects;
drop policy if exists "Membros da clinica podem deletar exames" on storage.objects;
drop policy if exists "Pacientes podem ver seus exames no storage" on storage.objects;

create policy "Membros da clinica podem ver exames"
    on storage.objects for select to authenticated
    using (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1)
          and public.acting_member_of(p.clinic_id, array['owner', 'nutritionist'])));

create policy "Membros da clinica podem enviar exames"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1)
          and public.acting_member_of(p.clinic_id, array['owner', 'nutritionist'])));

create policy "Membros da clinica podem deletar exames"
    on storage.objects for delete to authenticated
    using (bucket_id = 'exams-bucket' and exists (
        select 1 from public.patients p
        where p.id::text = split_part(objects.name, '/', 1)
          and public.acting_member_of(p.clinic_id, array['owner', 'nutritionist'])));

create policy "Pacientes podem ver seus exames no storage"
    on storage.objects for select to authenticated
    using (bucket_id = 'exams-bucket'
           and public.is_account_active(auth.uid())
           and exists (select 1 from public.patients p
                       where p.id::text = split_part(objects.name, '/', 1)
                         and p.user_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- 7. Ficha pré-consulta pública: rate limit também na escrita
-- ----------------------------------------------------------------------------
create or replace function public.update_patient_clinical_data(
    p_token uuid, p_allergies text, p_dietary_restrictions text, p_pathologies text,
    p_medications text, p_physical_activity_level text, p_profession text, p_sleep_quality text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_patient_id uuid;
begin
    perform public.enforce_public_rate_limit('patient_form_write:' || public.client_ip(), 10, interval '10 minutes');

    select id into v_patient_id from public.patients where form_token = p_token limit 1;
    if v_patient_id is null then
        return false;
    end if;

    update public.patients
    set allergies = p_allergies, dietary_restrictions = p_dietary_restrictions,
        pathologies = p_pathologies, medications = p_medications,
        physical_activity_level = p_physical_activity_level,
        profession = p_profession, sleep_quality = p_sleep_quality
    where id = v_patient_id;

    return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. EXECUTE: nada para PUBLIC/anon por padrão; liberar só o necessário
-- ----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- RPCs públicas (links enviados ao paciente, sem login)
grant execute on function public.get_patient_by_token(uuid)                      to anon, authenticated;
grant execute on function public.update_patient_clinical_data(uuid, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_patient_meal_plan(uuid, date)               to anon, authenticated;
grant execute on function public.get_appointment_details_public(uuid)            to anon, authenticated;
grant execute on function public.confirm_appointment_public(uuid, text)          to anon, authenticated;

-- Helpers usados dentro de policies (avaliadas como authenticated)
grant execute on function public.acting_member_of(uuid)                 to authenticated;
grant execute on function public.acting_member_of(uuid, text[])         to authenticated;
grant execute on function public.is_account_active(uuid)                to authenticated;
grant execute on function public.is_superadmin(uuid)                    to authenticated;
grant execute on function public.is_member_of_same_clinic(uuid, uuid)   to authenticated;
grant execute on function public.is_patient_of_clinic(uuid, uuid)       to authenticated;
grant execute on function public.patient_in_clinic(uuid, uuid)          to authenticated;
grant execute on function public.get_my_clinics()                       to authenticated;
grant execute on function public.is_last_master(uuid)                   to authenticated;

-- RPCs chamadas pelo app logado (cada uma valida o chamador por dentro)
grant execute on function public.create_my_clinic(text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_patient_account(uuid, text, text, text, text, text, text, date, text, text) to authenticated;
grant execute on function public.update_patient_account(uuid, uuid, text, text, text, text, text, date, text, text) to authenticated;
grant execute on function public.change_patient_password(uuid, text)    to authenticated;
grant execute on function public.toggle_patient_status(uuid, boolean)   to authenticated;
grant execute on function public.create_staff_member(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_staff_member(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.toggle_staff_member_status(uuid, uuid, boolean) to authenticated;
grant execute on function public.delete_staff_member(uuid, uuid)        to authenticated;
grant execute on function public.get_clinic_staff(uuid)                 to authenticated;
grant execute on function public.update_own_profile(text, text, text, text) to authenticated;
grant execute on function public.register_ai_call(integer)              to authenticated;
grant execute on function public.allocate_user_to_clinic(uuid, uuid, text) to authenticated;
grant execute on function public.delete_user_master(uuid)               to authenticated;

commit;
