-- ============================================================================
-- Migration 0041 — Resumo por e-mail (diário + semanal)
-- ============================================================================
--
-- Cada membro da equipe (dono, nutricionista, secretária) escolhe se recebe o
-- resumo, em quais dias da semana e a que horas. Na segunda-feira o resumo
-- semanal substitui o diário (quando o semanal está ligado).
--
-- Quem envia é a edge function `email-digest`, chamada pelo pg_cron a cada
-- 15 minutos (job criado no fim desta migration). A função usa a service role
-- e filtra os dados por papel: a secretária nunca recebe a parte clínica.
--
-- Opt-in: sem linha nesta tabela (ou enabled = false), nada é enviado.
--
-- PASSO MANUAL (fora do repositório, uma vez): criar o segredo que o cron
-- manda no cabeçalho, o mesmo valor do secret DIGEST_CRON_SECRET da função:
--     select vault.create_secret('<valor>', 'email_digest_cron_secret');
-- ============================================================================

begin;

create table if not exists public.email_digest_settings (
    user_id          uuid primary key references public.profiles(id) on delete cascade,
    enabled          boolean not null default false,
    -- 0 = domingo … 6 = sábado (Date.getDay)
    weekdays         smallint[] not null default '{1,2,3,4,5,6}',
    send_time        time not null default '06:00',
    weekly_enabled   boolean not null default true,
    timezone         text not null default 'America/Sao_Paulo',
    -- Controle de envio (só a função escreve): data local do último envio.
    last_daily_on    date,
    last_weekly_on   date,
    last_preview_at  timestamptz,
    updated_at       timestamptz not null default now(),
    constraint email_digest_weekdays_check
        check (weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
    constraint email_digest_send_time_check
        check (extract(minute from send_time) in (0, 30) and extract(second from send_time) = 0)
);

alter table public.email_digest_settings enable row level security;

drop policy if exists email_digest_settings_own_select on public.email_digest_settings;
drop policy if exists email_digest_settings_own_insert on public.email_digest_settings;
drop policy if exists email_digest_settings_own_update on public.email_digest_settings;

create policy email_digest_settings_own_select on public.email_digest_settings
    for select to authenticated using (user_id = auth.uid());
create policy email_digest_settings_own_insert on public.email_digest_settings
    for insert to authenticated with check (user_id = auth.uid());
create policy email_digest_settings_own_update on public.email_digest_settings
    for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- O usuário só mexe nas preferências; as colunas de controle são da função.
revoke insert, update on public.email_digest_settings from authenticated;
grant select on public.email_digest_settings to authenticated;
grant insert (user_id, enabled, weekdays, send_time, weekly_enabled, timezone, updated_at)
    on public.email_digest_settings to authenticated;
-- user_id entra no UPDATE por causa do upsert do PostgREST (a policy garante
-- que continua sendo o próprio usuário).
grant update (user_id, enabled, weekdays, send_time, weekly_enabled, timezone, updated_at)
    on public.email_digest_settings to authenticated;

commit;

-- ----------------------------------------------------------------------------
-- Agendamento (fora da transação: extensões e cron)
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('email-digest')
where exists (select 1 from cron.job where jobname = 'email-digest');

select cron.schedule(
    'email-digest',
    '*/15 * * * *',
    $cron$
    select net.http_post(
        url := 'https://dtkoegdmmhnxsrrxmoiq.supabase.co/functions/v1/email-digest',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                              where name = 'email_digest_cron_secret' limit 1)
        ),
        body := '{"mode":"cron"}'::jsonb,
        timeout_milliseconds := 120000
    );
    $cron$
);
