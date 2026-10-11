-- ============================================================================
-- Migration 0038 — Lembrete e confirmação de consulta pelo WhatsApp
-- ============================================================================
--
-- Um número central da plataforma (instância Pulze `NutriAI`, operada pelo n8n)
-- envia o lembrete em nome de cada clínica. Quem identifica a consulta não é o
-- número, é o appointments.public_token (migration 0022): ele vai no id dos
-- botões ("confirmar:<token>") e a resposta cai em confirm_appointment_public.
--
-- Resposta digitada ("sim", "não", "sair") é associada ao último lembrete da
-- conversa: pelo JID do chat (gravado quando o lembrete sai — contatos @lid não
-- trazem telefone) ou, na falta dele, pelo telefone (DDD + 8 últimos dígitos,
-- porque o JID de celular BR costuma vir sem o 9º dígito).
--
-- O n8n usa só as RPCs whatsapp_* abaixo, com a service role. Nenhuma delas é
-- executável por anon/authenticated. A equipe só LÊ o log (selo na agenda),
-- com a mesma visibilidade do agendamento.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Configuração por clínica e opt-out do paciente
-- ----------------------------------------------------------------------------
alter table public.clinics
    add column if not exists whatsapp_reminders_enabled boolean not null default false,
    add column if not exists whatsapp_reminder_hours int not null default 24;

alter table public.clinics drop constraint if exists clinics_whatsapp_reminder_hours_check;
alter table public.clinics add constraint clinics_whatsapp_reminder_hours_check
    check (whatsapp_reminder_hours in (12, 24, 48));

alter table public.patients
    add column if not exists whatsapp_opt_out boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. Log de mensagens
-- ----------------------------------------------------------------------------
create table if not exists public.appointment_whatsapp_messages (
    id                    uuid primary key default gen_random_uuid(),
    appointment_id        uuid not null references public.appointments(id) on delete cascade,
    clinic_id             uuid not null references public.clinics(id) on delete cascade,
    patient_id            uuid not null references public.patients(id) on delete cascade,
    kind                  text not null default 'reminder' check (kind in ('reminder')),
    -- data da consulta quando o lembrete foi gerado: remarcou => novo lembrete
    appointment_date_time timestamptz not null,
    phone                 text not null,
    status                text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
    provider_message_id   text,
    chat_jid              text,
    error                 text,
    response              text check (response in ('confirmado', 'cancelado', 'opt_out')),
    responded_at          timestamptz,
    created_at            timestamptz not null default now(),
    sent_at               timestamptz,
    unique (appointment_id, kind, appointment_date_time)
);

create index if not exists appointment_whatsapp_messages_chat_idx
    on public.appointment_whatsapp_messages (chat_jid, sent_at desc);
create index if not exists appointment_whatsapp_messages_phone_idx
    on public.appointment_whatsapp_messages (phone, sent_at desc);
create index if not exists appointment_whatsapp_messages_provider_idx
    on public.appointment_whatsapp_messages (provider_message_id);

alter table public.appointment_whatsapp_messages enable row level security;

revoke all on public.appointment_whatsapp_messages from anon, authenticated;
grant select on public.appointment_whatsapp_messages to authenticated;

-- Mesma visibilidade do agendamento (a RLS de appointments vale na subquery).
drop policy if exists appointment_whatsapp_messages_select on public.appointment_whatsapp_messages;
create policy appointment_whatsapp_messages_select on public.appointment_whatsapp_messages
    for select to authenticated
    using (exists (select 1 from public.appointments a where a.id = appointment_id));

-- ----------------------------------------------------------------------------
-- 3. Telefone: só dígitos, com DDI 55. null se não for utilizável.
-- ----------------------------------------------------------------------------
create or replace function public.whatsapp_normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
    select case
        when d ~ '^[0-9]{10,11}$'   then '55' || d
        when d ~ '^55[0-9]{10,11}$' then d
        else null
    end
    from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s;
$$;

-- ----------------------------------------------------------------------------
-- 4. Reserva os lembretes devidos (idempotente: rodar 2x não duplica)
-- ----------------------------------------------------------------------------
create or replace function public.whatsapp_claim_due_reminders(p_limit int default 30)
returns table (
    message_id        uuid,
    token             uuid,
    phone             text,
    patient_name      text,
    clinic_name       text,
    clinic_phone      text,
    professional_name text,
    service_name      text,
    modality          text,
    date_time         timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
    return query
    with due as (
        select a.id, a.clinic_id, a.patient_id, a.date_time, a.public_token,
               public.whatsapp_normalize_phone(p.phone) as phone,
               p.name as patient_name, c.name as clinic_name, c.phone as clinic_phone,
               pr.full_name as professional_name, s.name as service_name, s.modality
        from public.appointments a
        join public.patients p  on p.id = a.patient_id
        join public.clinics c   on c.id = a.clinic_id
        join public.profiles pr on pr.id = a.nutritionist_id
        left join public.services s on s.id = a.service_id
        where a.status = 'pendente'
          and c.whatsapp_reminders_enabled
          and not p.whatsapp_opt_out
          and public.whatsapp_normalize_phone(p.phone) is not null
          and a.date_time > now() + interval '1 hour'
          and a.date_time <= now() + make_interval(hours => c.whatsapp_reminder_hours)
          and (a.public_token_expires_at is null or a.public_token_expires_at > now())
          and not exists (
              select 1 from public.appointment_whatsapp_messages m
              where m.appointment_id = a.id
                and m.kind = 'reminder'
                and m.appointment_date_time = a.date_time
          )
        order by a.date_time
        limit greatest(1, least(coalesce(p_limit, 30), 100))
    ),
    ins as (
        insert into public.appointment_whatsapp_messages
            (appointment_id, clinic_id, patient_id, appointment_date_time, phone)
        select d.id, d.clinic_id, d.patient_id, d.date_time, d.phone from due d
        on conflict (appointment_id, kind, appointment_date_time) do nothing
        returning appointment_whatsapp_messages.id, appointment_whatsapp_messages.appointment_id
    )
    select ins.id, d.public_token, d.phone, d.patient_name, d.clinic_name, d.clinic_phone,
           d.professional_name, d.service_name, d.modality, d.date_time
    from ins
    join due d on d.id = ins.appointment_id
    order by d.date_time;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Resultado do envio (e vínculo do chat, quando a Pulze devolve)
-- ----------------------------------------------------------------------------
create or replace function public.whatsapp_mark_sent(
    p_message_id uuid,
    p_provider_message_id text default null,
    p_chat_jid text default null,
    p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.appointment_whatsapp_messages
       set status              = case when nullif(p_error, '') is null then 'sent' else 'failed' end,
           provider_message_id = coalesce(nullif(p_provider_message_id, ''), provider_message_id),
           chat_jid            = coalesce(nullif(p_chat_jid, ''), chat_jid),
           error               = nullif(left(p_error, 500), ''),
           sent_at             = case when nullif(p_error, '') is null then now() else sent_at end
     where id = p_message_id;
    return found;
end;
$$;

-- Eco do envio (evento message.exchange com fromMe) traz o JID real da conversa.
create or replace function public.whatsapp_link_chat(p_provider_message_id text, p_chat_jid text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    if nullif(p_provider_message_id, '') is null or nullif(p_chat_jid, '') is null then
        return false;
    end if;
    update public.appointment_whatsapp_messages
       set chat_jid = p_chat_jid
     where provider_message_id = p_provider_message_id
       and chat_jid is distinct from p_chat_jid;
    return found;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Resposta do paciente (botão ou texto)
-- ----------------------------------------------------------------------------
-- result: ok | already | expired | opt_out | unknown_intent | not_found
create or replace function public.whatsapp_register_reply(
    p_chat_jid text,
    p_text text default null,
    p_selected_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_action   text;
    v_token    uuid;
    v_msg      public.appointment_whatsapp_messages%rowtype;
    v_appt     public.appointments%rowtype;
    v_words    text[];
    v_digits   text := regexp_replace(split_part(coalesce(p_chat_jid, ''), '@', 1), '\D', '', 'g');
    v_is_pn    boolean := coalesce(p_chat_jid, '') like '%@s.whatsapp.net';
    v_ok       boolean;
    v_clinic   record;
    v_result   text;
begin
    -- 6.1 Intenção: botão tem prioridade sobre texto
    if p_selected_id ~* '^(confirmar|cancelar):[0-9a-f-]{36}$' then
        v_action := case when lower(split_part(p_selected_id, ':', 1)) = 'confirmar' then 'confirmado' else 'cancelado' end;
        v_token  := split_part(p_selected_id, ':', 2)::uuid;
    else
        v_words := regexp_split_to_array(
            translate(lower(coalesce(p_text, '')), 'áàâãéêíóôõúç', 'aaaaeeiooouc'),
            '[^a-z0-9]+');
        if v_words && array['sair', 'parar', 'stop', 'descadastrar'] then
            v_action := 'opt_out';
        elsif v_words && array['nao', 'cancelar', 'cancela', 'desmarcar', 'desmarca', '2'] then
            v_action := 'cancelado';
        elsif v_words && array['sim', 's', 'confirmo', 'confirmar', 'confirmado', 'confirma', 'ok', '1'] then
            v_action := 'confirmado';
        end if;
    end if;

    -- 6.2 Qual lembrete
    if v_token is not null then
        select * into v_appt from public.appointments where public_token = v_token;
        if found then
            select * into v_msg from public.appointment_whatsapp_messages
             where appointment_id = v_appt.id and kind = 'reminder'
             order by created_at desc limit 1;
        end if;
    else
        select m.* into v_msg
          from public.appointment_whatsapp_messages m
         where m.status = 'sent'
           and m.sent_at > now() - interval '72 hours'
           and (
                m.chat_jid = p_chat_jid
                or (v_is_pn and m.chat_jid is null
                    and length(v_digits) >= 12
                    and substr(m.phone, 3, 2) = substr(v_digits, 3, 2)
                    and right(m.phone, 8) = right(v_digits, 8))
           )
         order by m.sent_at desc
         limit 1;
        if found then
            select * into v_appt from public.appointments where id = v_msg.appointment_id;
        end if;
    end if;

    if v_appt.id is null then
        return jsonb_build_object('result', 'not_found', 'action', v_action);
    end if;

    select c.name, c.phone into v_clinic from public.clinics c where c.id = v_appt.clinic_id;

    -- 6.3 Aplica
    if v_action is null then
        v_result := 'unknown_intent';
    elsif v_action = 'opt_out' then
        update public.patients set whatsapp_opt_out = true where id = v_appt.patient_id;
        v_result := 'opt_out';
    else
        v_ok := public.confirm_appointment_public(v_appt.public_token, v_action);
        if v_ok then
            v_result := 'ok';
        elsif v_appt.status <> 'pendente' then
            v_result := 'already';
        else
            v_result := 'expired';
        end if;
    end if;

    if v_msg.id is not null and v_result in ('ok', 'opt_out') then
        update public.appointment_whatsapp_messages
           set response     = v_action,
               responded_at = now(),
               chat_jid     = coalesce(chat_jid, nullif(p_chat_jid, ''))
         where id = v_msg.id;
    end if;

    return jsonb_build_object(
        'result',       v_result,
        'action',       v_action,
        'status',       (select status from public.appointments where id = v_appt.id),
        'date_time',    v_appt.date_time,
        'clinic_name',  v_clinic.name,
        'clinic_phone', v_clinic.phone
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Permissões: só a service role (n8n)
-- ----------------------------------------------------------------------------
revoke execute on function public.whatsapp_claim_due_reminders(int)              from public, anon, authenticated;
revoke execute on function public.whatsapp_mark_sent(uuid, text, text, text)     from public, anon, authenticated;
revoke execute on function public.whatsapp_link_chat(text, text)                 from public, anon, authenticated;
revoke execute on function public.whatsapp_register_reply(text, text, text)      from public, anon, authenticated;
grant  execute on function public.whatsapp_claim_due_reminders(int)              to service_role;
grant  execute on function public.whatsapp_mark_sent(uuid, text, text, text)     to service_role;
grant  execute on function public.whatsapp_link_chat(text, text)                 to service_role;
grant  execute on function public.whatsapp_register_reply(text, text, text)      to service_role;

commit;
