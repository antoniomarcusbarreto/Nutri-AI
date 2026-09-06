-- ============================================================================
-- Migration 0018 — Onda 1: Blindagem de `profiles` (SEC-01) e fim da recursão
--                  de RLS nas policies de superadmin (SEC-12)
-- ============================================================================
--
-- SEC-01 (CRÍTICA): a policy "Usuários gerenciam o próprio perfil" era
--   FOR ALL USING (auth.uid() = id)  -- sem WITH CHECK, sem restrição de coluna
-- Qualquer usuário autenticado podia executar
--   supabase.from('profiles').update({ is_superadmin: true }).eq('id', <seu id>)
-- e, via as policies "Superadmins gerenciam ...", obter acesso irrestrito a
-- profiles / clinics / clinic_members / patients / patient_exams de TODAS as
-- clínicas. O front-end já enviava updates de objeto parcial arbitrário
-- (AuthContext.updateProfile, Onboarding upsert).
--
-- SEC-12 (BAIXA): as policies de superadmin faziam
--   (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid())
-- dentro de policy aplicada à própria tabela profiles — subquery recursiva e
-- reavaliada linha a linha. Já existe o padrão SECURITY DEFINER para isso
-- (get_my_clinics, migration 0004); aqui aplicamos o mesmo via is_superadmin().
--
-- Estratégia de bloqueio das colunas privilegiadas (is_superadmin, is_active):
-- o Postgres RLS não restringe colunas, então usamos um trigger BEFORE UPDATE.
-- Chamadas diretas via PostgREST rodam como current_user = 'authenticated';
-- as RPCs SECURITY DEFINER (toggle_patient_status, toggle_staff_member_status,
-- allocate_user_to_clinic, ...) rodam como o dono da função (postgres) e
-- continuam autorizadas a alterar essas colunas.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Helper is_superadmin(): adicionar SET search_path (estava ausente) e
--    marcar STABLE. Como é SECURITY DEFINER, chamá-la de dentro de uma policy
--    de `profiles` NÃO dispara a RLS de novo => elimina a recursão.
-- ----------------------------------------------------------------------------
create or replace function public.is_superadmin(user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = user_id and is_superadmin = true
    );
$$;

revoke execute on function public.is_superadmin(uuid) from anon;

-- ----------------------------------------------------------------------------
-- 2. Trigger: impede alteração de is_superadmin / is_active pelo canal direto.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if current_user in ('authenticated', 'anon') then
        if new.is_superadmin is distinct from old.is_superadmin then
            raise exception 'Alteração de is_superadmin não é permitida.'
                using errcode = '42501';
        end if;
        if new.is_active is distinct from old.is_active then
            raise exception 'Alteração de is_active não é permitida por este canal.'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enforce_profile_privileged_columns on public.profiles;
create trigger trg_enforce_profile_privileged_columns
    before update on public.profiles
    for each row execute function public.enforce_profile_privileged_columns();

-- ----------------------------------------------------------------------------
-- 3. Reescrever as policies de `profiles` com WITH CHECK e por comando.
-- ----------------------------------------------------------------------------
drop policy if exists "Usuários gerenciam o próprio perfil"        on public.profiles;
drop policy if exists "Usuários leem seus profiles e equipe leem"  on public.profiles;
drop policy if exists "Superadmins gerenciam todos os perfis"      on public.profiles;

-- SELECT: a própria linha, colegas da mesma clínica, ou superadmin.
create policy "profiles_select"
    on public.profiles for select
    to authenticated
    using (
        id = auth.uid()
        or public.is_member_of_same_clinic(profiles.id, auth.uid())
        or public.is_superadmin(auth.uid())
    );

-- INSERT: somente a própria linha (cobre o upsert do Onboarding).
create policy "profiles_insert_self"
    on public.profiles for insert
    to authenticated
    with check (id = auth.uid());

-- UPDATE: somente a própria linha; o trigger acima barra colunas privilegiadas.
create policy "profiles_update_self"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- Superadmin: acesso total, sem recursão (helper SECURITY DEFINER).
create policy "profiles_superadmin_all"
    on public.profiles for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 4. De-recursão das policies de superadmin em clinics e clinic_members
--    (migration 0001). Mesma semântica, agora via is_superadmin().
-- ----------------------------------------------------------------------------
drop policy if exists "Superadmins gerenciam todas as clinicas" on public.clinics;
create policy "Superadmins gerenciam todas as clinicas"
    on public.clinics for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

drop policy if exists "Superadmins veem todos os membros" on public.clinic_members;
create policy "Superadmins veem todos os membros"
    on public.clinic_members for all
    to authenticated
    using (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

commit;

-- ============================================================================
-- Rollback manual (se necessário):
--   drop trigger if exists trg_enforce_profile_privileged_columns on public.profiles;
--   drop function if exists public.enforce_profile_privileged_columns();
--   -- e recriar as policies antigas a partir das migrations 0000/0001/0008.
-- ============================================================================
