-- ============================================================================
-- Migration 0039 — Lembrete pelo WhatsApp disparado manualmente
-- ============================================================================
--
-- Nutricionista/secretária pedem o lembrete de uma consulta (ou de várias, ex.:
-- todos os não confirmados do dia). O pedido vira uma linha 'requested' no log
-- e o MESMO workflow do n8n que roda a cada 15 min a reserva e envia — nenhuma
-- mudança no n8n: whatsapp_claim_due_reminders mantém a assinatura.
--
-- Regra única para manual e automático: só consulta PENDENTE recebe pedido de
-- confirmação. Quem já confirmou (ou cancelou/concluiu) nunca recebe, e isso é
-- checado de novo na hora do envio (o paciente pode confirmar entre o pedido e
-- o disparo — o pedido é descartado como 'skipped').
--
-- Anti-repetição:
--   * manual: no máximo um pedido na fila por consulta, e intervalo mínimo de
--     6 h desde o último envio manual;
--   * automático: não sai se já houve um envio (manual ou automático) para a
--     mesma data da consulta dentro da janela da clínica (12/24/48 h).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Log: tipo 'manual', estados 'requested'/'skipped', quem pediu
-- ----------------------------------------------------------------------------
alter table public.appointment_whatsapp_messages
    add column if not exists requested_by uuid references public.profiles(id) on delete set null;

alter table public.appointment_whatsapp_messages drop constraint if exists appointment_whatsapp_messages_kind_check;
alter table public.appointment_whatsapp_messages add constraint appointment_whatsapp_messages_kind_check
    check (kind in ('reminder', 'manual'));

alter table public.appointment_whatsapp_messages drop constraint if exists appointment_whatsapp_messages_status_check;
alter table public.appointment_whatsapp_messages add constraint appointment_whatsapp_messages_status_check
    check (status in ('requested', 'queued', 'sent', 'failed', 'skipped'));

-- Manual pode se repetir (com intervalo); o automático continua único por data.
-- O nome da UNIQUE da 0038 foi gerado (e truncado) pelo Postgres: busca no catálogo.
do $$
declare v_name text;
begin
    for v_name in
        select conname from pg_constraint
         where conrelid = 'public.appointment_whatsapp_messages'::regclass and contype = 'u'
    loop
        execute format('alter table public.appointment_whatsapp_messages drop constraint %I', v_name);
    end loop;
end;
$$;
create unique index if not exists appointment_whatsapp_messages_auto_once
    on public.appointment_whatsapp_messages (appointment_id, appointment_date_time)
    where kind = 'reminder';
-- Um pedido manual na fila por consulta.
create unique index if not exists appointment_whatsapp_messages_manual_pending
    on public.appointment_whatsapp_messages (appointment_id)
    where kind = 'manual' and status in ('requested', 'queued');
create index if not exists appointment_whatsapp_messages_requested_idx
    on public.appointment_whatsapp_messages (created_at)
    where status = 'requested';

-- ----------------------------------------------------------------------------
-- 2. Pedido manual (equipe da clínica)
-- ----------------------------------------------------------------------------
-- Devolve { requested: n, skipped: [{ appointment_id, reason }] }
-- reason: not_found | not_pending | past | no_phone | opt_out | already_requested | too_soon
create or replace function public.whatsapp_request_reminders(p_appointment_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id        uuid;
    v_appt      record;
    v_reason    text;
    v_requested int := 0;
    v_skipped   jsonb := '[]'::jsonb;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado.' using errcode = '42501';
    end if;
    if coalesce(array_length(p_appointment_ids, 1), 0) > 100 then
        raise exception 'No máximo 100 consultas por vez.' using errcode = '22023';
    end if;

    foreach v_id in array coalesce(p_appointment_ids, '{}') loop
        v_reason := null;

        select a.id, a.clinic_id, a.patient_id, a.nutritionist_id, a.status, a.date_time,
               a.public_token_expires_at,
               public.whatsapp_normalize_phone(p.phone) as phone, p.whatsapp_opt_out
          into v_appt
          from public.appointments a
          join public.patients p on p.id = a.patient_id
         where a.id = v_id
           -- mesma regra de quem pode alterar o agendamento (0029)
           and public.acting_member_of(a.clinic_id)
           and (public.acting_member_of(a.clinic_id, array['secretary'])
                or a.nutritionist_id = auth.uid()
                or public.can_access_patient(a.patient_id));

        if v_appt.id is null then
            v_reason := 'not_found';
        elsif v_appt.status <> 'pendente' then
            v_reason := 'not_pending';
        elsif v_appt.date_time <= now()
              or (v_appt.public_token_expires_at is not null and v_appt.public_token_expires_at <= now()) then
            v_reason := 'past';
        elsif v_appt.phone is null then
            v_reason := 'no_phone';
        elsif v_appt.whatsapp_opt_out then
            v_reason := 'opt_out';
        elsif exists (select 1 from public.appointment_whatsapp_messages m
                      where m.appointment_id = v_appt.id
                        and m.status in ('requested', 'queued')) then
            v_reason := 'already_requested';
        elsif exists (select 1 from public.appointment_whatsapp_messages m
                      where m.appointment_id = v_appt.id
                        and m.status = 'sent'
                        and m.sent_at > now() - interval '6 hours') then
            v_reason := 'too_soon';
        end if;

        if v_reason is null then
            insert into public.appointment_whatsapp_messages
                (appointment_id, clinic_id, patient_id, kind, appointment_date_time, phone, status, requested_by)
            values
                (v_appt.id, v_appt.clinic_id, v_appt.patient_id, 'manual', v_appt.date_time, v_appt.phone, 'requested', auth.uid())
            on conflict do nothing;
            if found then
                v_requested := v_requested + 1;
            else
                v_reason := 'already_requested';
            end if;
        end if;

        if v_reason is not null then
            v_skipped := v_skipped || jsonb_build_object('appointment_id', v_id, 'reason', v_reason);
        end if;
    end loop;

    return jsonb_build_object('requested', v_requested, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.whatsapp_request_reminders(uuid[]) from public, anon;
grant  execute on function public.whatsapp_request_reminders(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Reserva para o n8n: pedidos manuais primeiro, depois os automáticos.
--    Mesma assinatura da 0038 (o workflow não muda).
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
declare
    v_limit  int := greatest(1, least(coalesce(p_limit, 30), 100));
    v_manual int;
begin
    -- 3.1 Pedidos que perderam o sentido: consulta já confirmada/cancelada,
    --     remarcada, passada, paciente saiu ou ficou sem telefone.
    update public.appointment_whatsapp_messages m
       set status = 'skipped',
           error  = case
                        when a.status <> 'pendente' then 'consulta já ' || a.status
                        when a.date_time <> m.appointment_date_time then 'consulta remarcada'
                        when a.date_time <= now() + interval '15 minutes' then 'consulta já passou'
                        when p.whatsapp_opt_out then 'paciente pediu para não receber'
                        else 'paciente sem telefone'
                    end
      from public.appointments a, public.patients p
     where m.status = 'requested'
       and a.id = m.appointment_id
       and p.id = m.patient_id
       and (a.status <> 'pendente'
            or a.date_time <> m.appointment_date_time
            or a.date_time <= now() + interval '15 minutes'
            or p.whatsapp_opt_out
            or public.whatsapp_normalize_phone(p.phone) is null);

    -- 3.2 Pedidos manuais válidos
    return query
    with picked as (
        select m.id
          from public.appointment_whatsapp_messages m
         where m.status = 'requested'
         order by m.created_at
         limit v_limit
         for update of m skip locked
    ),
    upd as (
        update public.appointment_whatsapp_messages m
           set status = 'queued'
          from picked
         where m.id = picked.id
        returning m.id, m.appointment_id, m.patient_id
    )
    select upd.id, a.public_token, public.whatsapp_normalize_phone(p.phone), p.name, c.name, c.phone,
           pr.full_name, s.name, s.modality, a.date_time
      from upd
      join public.appointments a  on a.id = upd.appointment_id
      join public.patients p      on p.id = upd.patient_id
      join public.clinics c       on c.id = a.clinic_id
      join public.profiles pr     on pr.id = a.nutritionist_id
      left join public.services s on s.id = a.service_id
     order by a.date_time;

    get diagnostics v_manual = row_count;
    if v_manual >= v_limit then
        return;
    end if;

    -- 3.3 Automáticos (como na 0038), sem repetir quem já recebeu um envio
    --     dentro da janela da clínica para a mesma data.
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
                and m.appointment_date_time = a.date_time
                and (m.kind = 'reminder'
                     or m.status in ('requested', 'queued')
                     or (m.status = 'sent'
                         and m.sent_at >= a.date_time - make_interval(hours => c.whatsapp_reminder_hours)))
          )
        order by a.date_time
        limit v_limit - v_manual
    ),
    ins as (
        insert into public.appointment_whatsapp_messages
            (appointment_id, clinic_id, patient_id, kind, appointment_date_time, phone)
        select d.id, d.clinic_id, d.patient_id, 'reminder', d.date_time, d.phone from due d
        on conflict do nothing
        returning appointment_whatsapp_messages.id, appointment_whatsapp_messages.appointment_id
    )
    select ins.id, d.public_token, d.phone, d.patient_name, d.clinic_name, d.clinic_phone,
           d.professional_name, d.service_name, d.modality, d.date_time
    from ins
    join due d on d.id = ins.appointment_id
    order by d.date_time;
end;
$$;

revoke execute on function public.whatsapp_claim_due_reminders(int) from public, anon, authenticated;
grant  execute on function public.whatsapp_claim_due_reminders(int) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Resposta por botão: o lembrete mais recente de qualquer tipo
-- ----------------------------------------------------------------------------
-- Só muda a busca do log quando a resposta vem pelo botão (antes filtrava
-- kind = 'reminder'); o restante é igual à 0038.
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

    if v_token is not null then
        select * into v_appt from public.appointments where public_token = v_token;
        if found then
            select * into v_msg from public.appointment_whatsapp_messages
             where appointment_id = v_appt.id and status = 'sent'
             order by sent_at desc limit 1;
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

revoke execute on function public.whatsapp_register_reply(text, text, text) from public, anon, authenticated;
grant  execute on function public.whatsapp_register_reply(text, text, text) to service_role;

commit;
