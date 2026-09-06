-- ============================================================================
-- Migration 0023 — Onda 2: Hardening das RPCs públicas (SEC-08) e quota de IA
--                  para o gemini-proxy (SEC-10)
-- ============================================================================
--
-- SEC-08 (MÉDIA): get_patient_meal_plan e get_patient_by_token são
-- SECURITY DEFINER sem `SET search_path` (search_path hijacking) e sem
-- rate-limit. get_patient_meal_plan autentica só por p_plan_id (uuid, segredo) +
-- p_birth_date (baixa entropia) → sem rate-limit dá para forçar a data.
-- get_patient_by_token autentica por p_token (uuid).
--
-- NOTA IMPORTANTE sobre "revogar anon":
--   Estas duas RPCs SÃO as rotas públicas /plano/:id e /ficha/:token — são
--   chamadas por usuários NÃO autenticados. Revogar `anon` quebraria as duas
--   páginas. O hardening correto aqui é:
--     1. `SET search_path = public` (fecha o hijacking).
--     2. Tornar o GRANT EXPLÍCITO (revoke de PUBLIC + grant a anon,authenticated)
--        em vez de herdado — assim fica claro que a exposição é intencional.
--     3. Rate-limit por IP (a proteção real contra brute-force da data/token).
--     4. Corrigir o retorno de get_patient_meal_plan (nutritionist.name não
--        existe em profiles; é full_name).
--
-- SEC-10 (MÉDIA): o gemini-proxy não tinha quota — qualquer autenticado
-- (inclusive paciente/secretária) podia gerar custo ilimitado na API Gemini.
-- Aqui criamos a infra de quota (tabela ai_usage + RPC register_ai_call) que a
-- Edge Function chama com o JWT do usuário; o restante do hardening (CORS
-- estrito, limite de payload, status HTTP reais) está no index.ts da função.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Infra de rate-limit para RPCs públicas (por IP)
-- ----------------------------------------------------------------------------
create table if not exists public.public_rpc_attempts (
    id           bigint generated always as identity primary key,
    bucket       text not null,
    attempted_at timestamptz not null default now()
);
create index if not exists public_rpc_attempts_bucket_time_idx
    on public.public_rpc_attempts (bucket, attempted_at);

alter table public.public_rpc_attempts enable row level security;
-- sem policies: só funções SECURITY DEFINER / service_role acessam.

create or replace function public.client_ip()
returns text
language sql
stable
set search_path = public
as $$
    select coalesce(
        nullif(
            split_part(
                (nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'),
                ',', 1
            ),
            ''
        ),
        'unknown'
    );
$$;

create or replace function public.enforce_public_rate_limit(
    p_bucket text, p_max int, p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count int;
begin
    -- GC oportunista das tentativas antigas
    delete from public.public_rpc_attempts
     where attempted_at < now() - interval '1 hour';

    select count(*) into v_count
      from public.public_rpc_attempts
     where bucket = p_bucket
       and attempted_at > now() - p_window;

    if v_count >= p_max then
        raise exception 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
            using errcode = '53400';
    end if;

    insert into public.public_rpc_attempts (bucket) values (p_bucket);
end;
$$;

revoke all on function public.enforce_public_rate_limit(text, int, interval) from public;

-- ----------------------------------------------------------------------------
-- 2. get_patient_meal_plan — search_path + rate-limit + correção do retorno
-- ----------------------------------------------------------------------------
create or replace function public.get_patient_meal_plan(p_plan_id uuid, p_birth_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_plan        record;
    v_patient     record;
    v_nutritionist record;
begin
    -- Máx. 8 tentativas por IP a cada 10 min (protege o palpite de p_birth_date)
    perform public.enforce_public_rate_limit(
        'meal_plan:' || public.client_ip(), 8, interval '10 minutes'
    );

    select * into v_plan from public.meal_plans where id = p_plan_id;
    if not found then
        raise exception 'Plano não encontrado';
    end if;

    select * into v_patient from public.patients where id = v_plan.patient_id;
    if not found then
        raise exception 'Paciente não encontrado';
    end if;

    if v_patient.birth_date is null or v_patient.birth_date <> p_birth_date then
        raise exception 'Data de nascimento incorreta';
    end if;

    select * into v_nutritionist from public.profiles where id = v_plan.nutritionist_id;

    return jsonb_build_object(
        'id',         v_plan.id,
        'created_at', v_plan.created_at,
        'kcal',       v_plan.kcal,
        'meals',      v_plan.meals,
        'patient',      jsonb_build_object('id', v_patient.id, 'name', v_patient.name),
        'nutritionist', jsonb_build_object('id', v_nutritionist.id, 'name', v_nutritionist.full_name)
    );
end;
$$;

revoke all on function public.get_patient_meal_plan(uuid, date) from public;
grant execute on function public.get_patient_meal_plan(uuid, date) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_patient_by_token — search_path + rate-limit
-- ----------------------------------------------------------------------------
create or replace function public.get_patient_by_token(p_token uuid)
returns table (
    name text, allergies text, dietary_restrictions text, pathologies text,
    medications text, physical_activity_level text, profession text, sleep_quality text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.enforce_public_rate_limit(
        'patient_token:' || public.client_ip(), 20, interval '10 minutes'
    );

    return query
    select
        p.name, p.allergies, p.dietary_restrictions, p.pathologies,
        p.medications, p.physical_activity_level, p.profession, p.sleep_quality
    from public.patients p
    where p.form_token = p_token
    limit 1;
end;
$$;

revoke all on function public.get_patient_by_token(uuid) from public;
grant execute on function public.get_patient_by_token(uuid) to anon, authenticated;

-- update_patient_clinical_data (mesma rota /ficha, escrita) — só search_path aqui;
-- já tem SET search_path na 0017b. Mantido como está.

-- ----------------------------------------------------------------------------
-- 4. Quota de IA para o gemini-proxy (SEC-10)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_usage (
    user_id uuid  not null references public.profiles(id) on delete cascade,
    day     date  not null default current_date,
    calls   int   not null default 0,
    primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

create policy "ai_usage_self_select"
    on public.ai_usage for select to authenticated
    using (user_id = auth.uid());

create or replace function public.register_ai_call(p_daily_limit int default 50)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_calls int;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado.' using errcode = '28000';
    end if;

    -- Só equipe clínica ativa pode acionar a IA (fecha "paciente chama gemini").
    if not public.is_account_active(auth.uid())
       or not exists (
           select 1 from public.clinic_members
           where user_id = auth.uid() and role in ('owner', 'nutritionist')
       )
    then
        raise exception 'Sem permissão para usar os recursos de IA.' using errcode = '42501';
    end if;

    insert into public.ai_usage (user_id, day, calls)
    values (auth.uid(), current_date, 1)
    on conflict (user_id, day)
    do update set calls = public.ai_usage.calls + 1
    returning calls into v_calls;

    if v_calls > p_daily_limit then
        raise exception 'Limite diário de uso da IA atingido (% chamadas).', p_daily_limit
            using errcode = '53400';
    end if;
end;
$$;

revoke all on function public.register_ai_call(int) from public;
grant execute on function public.register_ai_call(int) to authenticated;

commit;
