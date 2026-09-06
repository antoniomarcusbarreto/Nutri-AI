-- ============================================================================
-- Migration 0022 — Onda 2: Token opaco nas rotas públicas de agendamento (SEC-06)
-- ============================================================================
--
-- SEC-06 (ALTA): as rotas públicas /confirmar/:id usavam o UUID real do
-- agendamento. get_appointment_details_public(uuid) e
-- confirm_appointment_public(uuid, text) operavam só a partir desse UUID —
-- enumerável (aparece em logs de servidor, no Referer para terceiros, no
-- histórico do navegador) e sem qualquer segredo. Qualquer pessoa que
-- descobrisse/adivinhasse o UUID via IDOR conseguia ver nome do paciente +
-- clínica + profissional e confirmar/cancelar consultas alheias.
--
-- ----------------------------------------------------------------------------
-- Escolha de mecanismo: token OPACO ALEATÓRIO por agendamento (não JWT/HMAC).
-- ----------------------------------------------------------------------------
-- Para um link de confirmação de consulta, o token opaco é a melhor opção:
--   * Impossível de forjar (128 bits de aleatoriedade do gen_random_uuid()),
--     sem necessidade de segredo do servidor nem de gestão de chave.
--   * Revogável de graça (rotacionar/anular a coluna) — usamos isso para
--     invalidar o link antigo quando a consulta é remarcada.
--   * Não vaza metadados (JWT exporia iat/exp em base64 no link).
--   * O real appointments.id nunca mais aparece na URL nem na resposta pública.
-- HMAC/JWT só valeria a pena para validação 100% stateless sem tabela — aqui já
-- temos a linha do agendamento, então o custo (segredo no banco via Vault,
-- rotação de chave, relógio) não se paga. Expiração e uso único são resolvidos
-- com duas colunas simples + a checagem de status que já existia.
--
-- Estrutura:
--   * appointments.public_token           uuid  -- aleatório, único, NOT NULL
--   * appointments.public_token_expires_at timestamptz -- date_time + 2 dias
--   * trigger: gera o token no INSERT; ROTACIONA o token e recalcula a
--     expiração sempre que date_time muda (remarcação => link antigo morre).
--   * as duas RPCs públicas passam a receber p_token uuid, validam existência
--     + expiração, ganham SET search_path = public, e DEIXAM DE RETORNAR o id.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Colunas
-- ----------------------------------------------------------------------------
alter table public.appointments
    add column if not exists public_token uuid,
    add column if not exists public_token_expires_at timestamptz;

-- Backfill das linhas existentes
update public.appointments
set public_token = gen_random_uuid(),
    public_token_expires_at = date_time + interval '2 days'
where public_token is null;

alter table public.appointments
    alter column public_token set not null,
    alter column public_token set default gen_random_uuid();

create unique index if not exists appointments_public_token_key
    on public.appointments (public_token);

-- ----------------------------------------------------------------------------
-- 2. Trigger: emissão no insert, rotação na remarcação
-- ----------------------------------------------------------------------------
create or replace function public.set_appointment_public_token()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        new.public_token := coalesce(new.public_token, gen_random_uuid());
        new.public_token_expires_at := new.date_time + interval '2 days';
    elsif tg_op = 'UPDATE' and new.date_time is distinct from old.date_time then
        -- Remarcação: invalida o link enviado anteriormente.
        new.public_token := gen_random_uuid();
        new.public_token_expires_at := new.date_time + interval '2 days';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_set_appointment_public_token on public.appointments;
create trigger trg_set_appointment_public_token
    before insert or update on public.appointments
    for each row execute function public.set_appointment_public_token();

-- ----------------------------------------------------------------------------
-- 3. RPC pública de leitura — por token, sem expor o id
-- ----------------------------------------------------------------------------
drop function if exists public.get_appointment_details_public(uuid);

create function public.get_appointment_details_public(p_token uuid)
returns table (
    date_time timestamptz,
    status text,
    patient_name text,
    service_name text,
    professional_name text,
    clinic_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select
        a.date_time,
        a.status,
        p.name          as patient_name,
        s.name          as service_name,
        prof.full_name  as professional_name,
        c.name          as clinic_name
    from public.appointments a
    join public.patients p        on a.patient_id = p.id
    join public.profiles prof     on a.nutritionist_id = prof.id
    left join public.services s   on a.service_id = s.id
    join public.clinics c         on a.clinic_id = c.id
    where a.public_token = p_token
      and (a.public_token_expires_at is null or a.public_token_expires_at > now());
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC pública de confirmação — por token, uso único
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_appointment_public(uuid, text);

create function public.confirm_appointment_public(p_token uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
    v_current_status text;
begin
    if p_status not in ('confirmado', 'cancelado') then
        return false;
    end if;

    select a.id, a.status
      into v_id, v_current_status
    from public.appointments a
    where a.public_token = p_token
      and (a.public_token_expires_at is null or a.public_token_expires_at > now());

    if v_id is null then
        return false;                    -- token inexistente ou expirado
    end if;

    if v_current_status <> 'pendente' then
        return false;                    -- uso único: já confirmado/cancelado/concluído
    end if;

    update public.appointments
    set status = p_status
    where id = v_id;

    return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Grants — ESTAS são as rotas públicas: anon PRECISA executar.
-- ----------------------------------------------------------------------------
revoke all on function public.get_appointment_details_public(uuid) from public;
revoke all on function public.confirm_appointment_public(uuid, text) from public;
grant execute on function public.get_appointment_details_public(uuid) to anon, authenticated;
grant execute on function public.confirm_appointment_public(uuid, text) to anon, authenticated;

commit;

-- ============================================================================
-- Rollback manual: drop das 2 funções novas + recriar as antigas por
-- appointment_id (ver 0017b_remote_schema.sql), drop do trigger/função
-- set_appointment_public_token, drop das 2 colunas.
-- ============================================================================
