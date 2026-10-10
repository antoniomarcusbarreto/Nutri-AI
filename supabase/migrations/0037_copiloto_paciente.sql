-- ============================================================================
-- Migration 0037 — Co-piloto do paciente (Portal) — cota própria
-- ============================================================================
--
-- O assistente do portal (Edge Function `patient-copilot`) responde sobre o
-- plano alimentar, a ficha e o diário do paciente: receitas, substituições,
-- lista de compras, "como estou indo". Só leitura, conversa não é salva.
--
-- A cota fica numa tabela própria: `ai_usage` já é usada pelo scanner de
-- refeições do paciente (register_patient_meal_ai, 20/dia) e o chat não pode
-- consumir as análises de foto (nem o contrário).
--
-- Publicar JUNTO com a função `patient-copilot` e o front (/portal/assistente).
-- ============================================================================

begin;

create table if not exists public.patient_copilot_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    day     date not null default current_date,
    calls   int  not null default 0,
    primary key (user_id, day)
);
alter table public.patient_copilot_usage enable row level security;

drop policy if exists patient_copilot_usage_self_select on public.patient_copilot_usage;
create policy patient_copilot_usage_self_select on public.patient_copilot_usage for select to authenticated
    using (user_id = auth.uid());

-- 1 por mensagem do paciente. Recusa equipe e paciente com acesso vencido.
create or replace function public.register_patient_copilot(p_daily_limit int default 40)
returns void language plpgsql security definer set search_path = public
as $$
declare
    v_calls int;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado.' using errcode = '28000';
    end if;
    if public.current_patient_id() is null or not public.patient_portal_active() then
        raise exception 'Seu acesso está somente leitura. Fale com seu nutricionista para renovar.' using errcode = '42501';
    end if;
    insert into public.patient_copilot_usage (user_id, day, calls)
    values (auth.uid(), current_date, 1)
    on conflict (user_id, day) do update set calls = public.patient_copilot_usage.calls + 1
    returning calls into v_calls;
    if v_calls > p_daily_limit then
        raise exception 'Você atingiu o limite de % mensagens por hoje. Volte amanhã.', p_daily_limit
            using errcode = '53400';
    end if;
end;
$$;

revoke execute on function public.register_patient_copilot(int) from public, anon;
grant execute on function public.register_patient_copilot(int) to authenticated;

commit;

-- Rollback:
--   drop function public.register_patient_copilot(int);
--   drop table public.patient_copilot_usage;
