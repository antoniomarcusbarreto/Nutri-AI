-- ============================================================================
-- Migration 0021 — Onda 2: Gestão de equipe restrita ao `owner` (SEC-04)
-- ============================================================================
--
-- SEC-04 (ALTA): create_staff_member / update_staff_member /
-- toggle_staff_member_status / delete_staff_member aceitavam
--   v_caller_role IN ('owner', 'nutritionist')
-- Um nutricionista podia então:
--   - criar outros nutricionistas / secretárias;
--   - promover uma secretária a nutricionista (update sem validar p_role);
--   - desativar e DELETAR contas de colegas (delete_staff_member chega a
--     executar DELETE FROM auth.users).
-- O próprio comentário no código original admitia que "o padrão seria owner".
--
-- Correção:
--   - as quatro funções passam a exigir v_caller_role = 'owner';
--   - update_staff_member valida p_role IN ('nutritionist','secretary') — impede
--     promover alguém a 'owner' por esse caminho (o owner é definido no signup /
--     por allocate_user_to_clinic, que é superadmin-only);
--   - proteção contra o owner remover/rebaixar a si mesmo já existia em
--     toggle/delete; replicada em update.
--
-- Reaproveita a assinatura e o corpo pós-0020 (sem UPDATE em auth.users.email).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. create_staff_member — somente owner
-- ----------------------------------------------------------------------------
create or replace function public.create_staff_member(
    p_clinic_id uuid, p_name text, p_email text, p_phone text,
    p_crn text, p_role text, p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_caller_role text;
begin
    select role into v_caller_role
    from public.clinic_members
    where clinic_id = p_clinic_id and user_id = auth.uid()
    limit 1;

    if v_caller_role is distinct from 'owner' then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.';
    end if;

    if p_role not in ('nutritionist', 'secretary') then
        raise exception 'Papel inválido. Deve ser nutritionist ou secretary.';
    end if;

    select id into v_user_id from auth.users where email = p_email limit 1;

    if v_user_id is null then
        v_user_id := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) values (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
            p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', ''
        );
    end if;

    insert into public.profiles (id, full_name, phone, crn, is_active)
    values (v_user_id, p_name, p_phone, p_crn, true)
    on conflict (id) do update set
        full_name = excluded.full_name,
        phone     = excluded.phone,
        crn       = excluded.crn;

    insert into public.clinic_members (clinic_id, user_id, role)
    values (p_clinic_id, v_user_id, p_role)
    on conflict (clinic_id, user_id) do update set role = excluded.role;

    return v_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. update_staff_member — somente owner; p_role limitado; sem auto-rebaixamento
--    (mantém o comportamento pós-0020: não toca auth.users.email)
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

    if v_caller_role is distinct from 'owner' then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Use "Meu Perfil" para editar seus próprios dados.';
    end if;

    if p_role not in ('nutritionist', 'secretary') then
        raise exception 'Papel inválido. Deve ser nutritionist ou secretary.';
    end if;

    if not exists (
        select 1 from public.clinic_members
        where clinic_id = p_clinic_id and user_id = p_user_id
    ) then
        raise exception 'Usuário não pertence a esta clínica.';
    end if;

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
-- 3. toggle_staff_member_status — somente owner
-- ----------------------------------------------------------------------------
create or replace function public.toggle_staff_member_status(
    p_clinic_id uuid, p_user_id uuid, p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_role text;
begin
    select role into v_caller_role
    from public.clinic_members
    where clinic_id = p_clinic_id and user_id = auth.uid()
    limit 1;

    if v_caller_role is distinct from 'owner' then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Você não pode desativar seu próprio acesso.';
    end if;

    if not exists (
        select 1 from public.clinic_members
        where clinic_id = p_clinic_id and user_id = p_user_id
    ) then
        raise exception 'Usuário não pertence a esta clínica.';
    end if;

    update public.profiles
    set is_active = p_is_active
    where id = p_user_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. delete_staff_member — somente owner
-- ----------------------------------------------------------------------------
create or replace function public.delete_staff_member(
    p_clinic_id uuid, p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_caller_role text;
begin
    select role into v_caller_role
    from public.clinic_members
    where clinic_id = p_clinic_id and user_id = auth.uid()
    limit 1;

    if v_caller_role is distinct from 'owner' then
        raise exception 'Acesso negado. Apenas o proprietário da clínica pode gerenciar a equipe.';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Você não pode remover a si mesmo da clínica.';
    end if;

    delete from public.clinic_members
    where clinic_id = p_clinic_id and user_id = p_user_id;

    -- Se o usuário não é membro de nenhuma outra clínica, limpa profile + auth.
    if not exists (select 1 from public.clinic_members where user_id = p_user_id) then
        delete from public.profiles where id = p_user_id;
        delete from auth.users where id = p_user_id;
    end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Hygiene
-- ----------------------------------------------------------------------------
revoke execute on function public.create_staff_member(uuid, text, text, text, text, text, text) from anon;
revoke execute on function public.update_staff_member(uuid, uuid, text, text, text, text, text)  from anon;
revoke execute on function public.toggle_staff_member_status(uuid, uuid, boolean)                from anon;
revoke execute on function public.delete_staff_member(uuid, uuid)                                from anon;

commit;
