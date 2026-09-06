-- ============================================================================
-- Migration 0020 — Onda 2: Remoção do UPDATE direto em auth.users.email (SEC-03)
-- ============================================================================
--
-- SEC-03 (ALTA): três RPCs SECURITY DEFINER faziam
--   UPDATE auth.users SET email = p_email, email_change = '' WHERE id = ...
-- sem NENHUMA verificação/confirmação. Consequência: um owner/nutricionista
-- podia trocar o e-mail de login de qualquer membro da equipe ou paciente da
-- clínica para um endereço que ele controla e, em seguida, usar "esqueci minha
-- senha" → account takeover. `update_own_profile` permitia o mesmo para a
-- própria conta, pulando a dupla confirmação do GoTrue.
--
-- Correção nesta migration:
--   - `update_own_profile`      → deixa de tocar auth.users; só public.profiles.
--   - `update_staff_member`     → idem; passa a validar que o alvo é membro da
--                                 clínica antes de escrever no profile dele.
--   - `update_patient_account`  → idem; `patients.email` (contato/CRM) continua
--                                 sendo atualizado, mas NÃO o e-mail de login.
--   - REVOKE EXECUTE ... FROM anon nas três.
--
-- A troca do e-mail de LOGIN passa a ter dois caminhos, ambos com confirmação:
--   1. Própria conta  → cliente chama supabase.auth.updateUser({ email })
--                        (GoTrue envia link de confirmação para o novo e-mail).
--   2. Conta de terceiro (staff/paciente, iniciada pelo owner)
--                      → Edge Function `admin-update-user-email`, que autentica
--                        o chamador, confirma que ele é OWNER da clínica do
--                        alvo e chama auth.admin.updateUserById(...) via
--                        service_role — o GoTrue dispara a confirmação.
--
-- NOTA: a restrição de gestão de equipe a `owner` (SEC-04) fica na migration
-- 0021. Aqui mantemos a checagem de papel exatamente como estava.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. update_own_profile — não altera mais auth.users
-- ----------------------------------------------------------------------------
create or replace function public.update_own_profile(
    p_name text, p_email text, p_phone text, p_crn text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- p_email permanece na assinatura por compatibilidade com o cliente, mas a
    -- troca do e-mail de login é feita via supabase.auth.updateUser (SEC-03).
    update public.profiles
    set full_name = p_name,
        phone     = p_phone,
        crn       = p_crn
    where id = auth.uid();
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. update_staff_member — não altera mais auth.users; valida vínculo do alvo
-- ----------------------------------------------------------------------------
create or replace function public.update_staff_member(
    p_clinic_id uuid, p_user_id uuid, p_name text, p_email text,
    p_phone text, p_crn text, p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_role text;
begin
    select cm.role into v_caller_role
    from public.clinic_members cm
    where cm.clinic_id = p_clinic_id and cm.user_id = auth.uid()
    limit 1;

    if v_caller_role is null or v_caller_role not in ('owner', 'nutritionist') then
        raise exception 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
    end if;

    if not exists (
        select 1 from public.clinic_members
        where clinic_id = p_clinic_id and user_id = p_user_id
    ) then
        raise exception 'Usuário não pertence a esta clínica.';
    end if;

    -- Troca de e-mail de login removida daqui (SEC-03):
    -- use a Edge Function admin-update-user-email.
    update public.profiles
    set full_name = p_name,
        phone     = p_phone,
        crn       = p_crn
    where id = p_user_id;

    update public.clinic_members
    set role = p_role
    where clinic_id = p_clinic_id and user_id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. update_patient_account — patients.email (contato) sim; auth.users não
-- ----------------------------------------------------------------------------
create or replace function public.update_patient_account(
    p_clinic_id uuid, p_patient_id uuid, p_name text, p_cpf text, p_email text,
    p_phone text, p_status text, p_birth_date date, p_biological_sex text,
    p_main_goal text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_role text;
    v_user_id uuid;
begin
    select cm.role into v_caller_role
    from public.clinic_members cm
    where cm.clinic_id = p_clinic_id and cm.user_id = auth.uid()
    limit 1;

    if v_caller_role is null or v_caller_role not in ('owner', 'nutritionist') then
        raise exception 'Acesso negado. Apenas nutricionistas ou proprietários podem alterar pacientes.';
    end if;

    select user_id into v_user_id
    from public.patients
    where id = p_patient_id and clinic_id = p_clinic_id;

    update public.patients
    set name            = p_name,
        cpf             = p_cpf,
        email           = p_email,      -- contato/CRM apenas
        phone           = p_phone,
        status          = p_status,
        birth_date      = p_birth_date,
        biological_sex  = p_biological_sex,
        main_goal       = p_main_goal
    where id = p_patient_id and clinic_id = p_clinic_id;

    -- Se o paciente tem conta de acesso, sincroniza apenas nome/telefone.
    -- O e-mail de login NÃO é alterado aqui (SEC-03).
    if v_user_id is not null then
        update public.profiles
        set full_name = p_name,
            phone     = p_phone
        where id = v_user_id;
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Hygiene: essas RPCs são para usuários autenticados
-- ----------------------------------------------------------------------------
revoke execute on function public.update_own_profile(text, text, text, text)                       from anon;
revoke execute on function public.update_staff_member(uuid, uuid, text, text, text, text, text)     from anon;
revoke execute on function public.update_patient_account(uuid, uuid, text, text, text, text, text, date, text, text) from anon;

commit;
