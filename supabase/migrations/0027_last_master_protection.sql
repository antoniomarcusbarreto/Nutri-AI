-- 0027: Proteção do último usuário Master
--
-- Regra de negócio: se existir apenas um Master (is_superadmin = true), ele não
-- pode ser excluído, bloqueado, rebaixado nem alocado a uma clínica pelo painel.
-- A UI já esconde as ações, mas a garantia fica aqui (RPCs + trigger) e na edge
-- function admin-actions (senha / bloqueio via auth.admin).

-- 1. Helper: o usuário é o único Master da plataforma?
create or replace function public.is_last_master(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.profiles where id = p_user_id and is_superadmin = true)
       and (select count(*) from public.profiles where is_superadmin = true) <= 1;
$$;

revoke execute on function public.is_last_master(uuid) from anon, public;
grant execute on function public.is_last_master(uuid) to authenticated, service_role;

-- 2. Trigger em profiles: bloqueia desativar/rebaixar/apagar o último Master,
--    qualquer que seja o canal (RPC, service_role, cascade de auth.users).
create or replace function public.protect_last_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        if old.is_superadmin and public.is_last_master(old.id) then
            raise exception 'O único usuário Master da plataforma não pode ser removido.';
        end if;
        return old;
    end if;

    if old.is_superadmin and public.is_last_master(old.id) then
        if new.is_superadmin is distinct from true then
            raise exception 'O único usuário Master da plataforma não pode perder o perfil Master.';
        end if;
        if new.is_active is distinct from true then
            raise exception 'O único usuário Master da plataforma não pode ser bloqueado.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_protect_last_master on public.profiles;
create trigger trg_protect_last_master
    before update of is_superadmin, is_active or delete on public.profiles
    for each row execute function public.protect_last_master();

-- 3. delete_user_master: mensagem clara antes de chegar no cascade.
create or replace function public.delete_user_master(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Acesso negado. Apenas administradores Master podem excluir usuários.';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Você não pode excluir seu próprio perfil Master.';
    end if;

    if public.is_last_master(p_user_id) then
        raise exception 'O único usuário Master da plataforma não pode ser removido.';
    end if;

    delete from auth.users where id = p_user_id;
end;
$$;

-- 4. allocate_user_to_clinic: o último Master não é alocado a clínicas.
create or replace function public.allocate_user_to_clinic(p_user_id uuid, p_clinic_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_superadmin(auth.uid()) then
        raise exception 'Acesso negado. Apenas administradores Master podem alocar usuários.';
    end if;

    if public.is_last_master(p_user_id) then
        raise exception 'O único usuário Master da plataforma não pode ter seus dados alterados.';
    end if;

    if p_role not in ('owner', 'nutritionist', 'secretary') then
        raise exception 'Papel inválido. Deve ser owner, nutritionist ou secretary.';
    end if;

    -- Uma clínica por usuário: remove vínculos anteriores antes de inserir.
    delete from public.clinic_members where user_id = p_user_id;

    insert into public.clinic_members (clinic_id, user_id, role)
    values (p_clinic_id, p_user_id, p_role);
end;
$$;
