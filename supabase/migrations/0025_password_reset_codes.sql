-- ============================================================================
-- Migration 0025 — Recuperação de senha self-service (código por e-mail via Resend)
-- ============================================================================
--
-- Tabela para guardar o código de 6 dígitos (hasheado) enviado por e-mail
-- quando o usuário esquece a senha, e o helper para resolver o uid a partir
-- do e-mail (não há `getUserByEmail` no supabase-js; `auth.users` não é
-- exposto via REST, só por SQL com privilégio adequado).
--
-- Acesso: só as Edge Functions `send-password-reset-code` e
-- `reset-password-with-code`, via `service_role` (bypassa RLS). Nenhuma
-- policy é criada de propósito — igual ao fechamento das firestore.rules do
-- DoseCerta-AI para `codigosRecuperacao`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Tabela de códigos de recuperação (um código pendente por usuário)
-- ----------------------------------------------------------------------------
create table public.password_reset_codes (
    user_id uuid primary key references auth.users(id) on delete cascade,
    code_hash text not null,
    expires_at timestamptz not null,
    attempts int not null default 0,
    created_at timestamptz not null default now()
);

alter table public.password_reset_codes enable row level security;
-- Sem policies: nenhum role de cliente (anon/authenticated) enxerga esta tabela.

-- ----------------------------------------------------------------------------
-- 2. Helper — resolve o uid a partir do e-mail (lê auth.users)
--    SECURITY DEFINER porque `auth.users` não é acessível a partir do schema
--    `public` sem privilégio elevado.
-- ----------------------------------------------------------------------------
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
    select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

commit;

-- ============================================================================
-- Verificação:
--   1. Como anon/authenticated: select * from password_reset_codes -> vazio/erro (RLS)
--   2. Como anon/authenticated: select public.get_user_id_by_email('x@y.com') -> erro de permissão
--   3. Via service_role (Edge Function): consegue ler/gravar a tabela e chamar a função normalmente
--
-- Rollback:
--   drop function if exists public.get_user_id_by_email(text);
--   drop table if exists public.password_reset_codes;
-- ============================================================================
