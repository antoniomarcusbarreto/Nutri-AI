-- ============================================================================
-- Verificação da migration 0038 (lembrete/confirmação pelo WhatsApp).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0038 — 10/10 ok".
-- ============================================================================
do $$
declare
    v_clinic  uuid := gen_random_uuid();
    v_other   uuid := gen_random_uuid();   -- outra clínica
    v_a  uuid := gen_random_uuid();        -- dono/nutri da clínica
    v_x  uuid := gen_random_uuid();        -- dono da outra clínica
    v_p1 uuid := gen_random_uuid();        -- paciente com telefone
    v_p2 uuid := gen_random_uuid();        -- paciente sem telefone
    v_ap1 uuid := gen_random_uuid();
    v_ap2 uuid := gen_random_uuid();
    v_ap3 uuid := gen_random_uuid();       -- fora da janela (3 dias)
    v_msg uuid;
    v_token uuid;
    v_n int;
    v_j jsonb;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           'wa0038-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
    from unnest(array[v_a, v_x]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Nutri A', true), (v_x, 'Nutri X', true);
    insert into public.clinics (id, name, owner_id, plan_level, phone, whatsapp_reminders_enabled, whatsapp_reminder_hours) values
        (v_clinic, 'Clínica WA', v_a, 'starter', '(79) 3333-4444', true, 24),
        (v_other,  'Outra Clínica', v_x, 'starter', null, true, 24);
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_other, v_x, 'owner');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status) values
        (v_p1, v_clinic, v_a, 'Maria', '(79) 99912-2107', 'ativo'),
        (v_p2, v_clinic, v_a, 'Sem Fone', null, 'ativo');
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, date_time, status) values
        (v_ap1, v_clinic, v_p1, v_a, now() + interval '20 hours', 'pendente'),
        (v_ap2, v_clinic, v_p2, v_a, now() + interval '20 hours', 'pendente'),
        (v_ap3, v_clinic, v_p1, v_a, now() + interval '3 days',  'pendente');

    -- 1. telefone normalizado
    v_total := v_total + 1;
    if public.whatsapp_normalize_phone('(79) 99912-2107') = '5579999122107'
       and public.whatsapp_normalize_phone('123') is null then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] normaliza telefone';
    else v_rel := v_rel || E'\n[FALHOU] normaliza telefone'; end if;

    -- 2. claim pega só a consulta devida com telefone (filtra pela clínica de teste)
    v_total := v_total + 1;
    select r.message_id, r.token into v_msg, v_token
      from public.whatsapp_claim_due_reminders(100) r where r.token = (select public_token from public.appointments where id = v_ap1);
    select count(*) into v_n from public.appointment_whatsapp_messages where clinic_id = v_clinic;
    if v_msg is not null and v_n = 1 then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] claim reserva 1 lembrete (sem fone e fora da janela ficam de fora)';
    else v_rel := v_rel || E'\n[FALHOU] claim — linhas da clínica: ' || v_n; end if;

    -- 3. rodar de novo não duplica
    v_total := v_total + 1;
    perform public.whatsapp_claim_due_reminders(100);
    select count(*) into v_n from public.appointment_whatsapp_messages where clinic_id = v_clinic;
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] claim idempotente';
    else v_rel := v_rel || E'\n[FALHOU] claim duplicou: ' || v_n; end if;

    -- 4. mark_sent
    v_total := v_total + 1;
    perform public.whatsapp_mark_sent(v_msg, 'PROV-1', null, null);
    perform public.whatsapp_link_chat('PROV-1', '999999999@lid');
    if exists (select 1 from public.appointment_whatsapp_messages
               where id = v_msg and status = 'sent' and chat_jid = '999999999@lid') then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] mark_sent + link_chat';
    else v_rel := v_rel || E'\n[FALHOU] mark_sent/link_chat'; end if;

    -- 5. texto sem intenção
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('999999999@lid', 'bom dia, tudo bem?', null);
    if v_j->>'result' = 'unknown_intent' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] texto sem intenção';
    else v_rel := v_rel || E'\n[FALHOU] sem intenção: ' || v_j::text; end if;

    -- 6. "Sim" por texto num chat @lid confirma
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('999999999@lid', 'Sim, confirmo!', null);
    if v_j->>'result' = 'ok' and (select status from public.appointments where id = v_ap1) = 'confirmado' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] "sim" por texto (@lid) confirma';
    else v_rel := v_rel || E'\n[FALHOU] sim por texto: ' || v_j::text; end if;

    -- 7. botão repetido => already
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('999999999@lid', null, 'cancelar:' || v_token);
    if v_j->>'result' = 'already' and (select status from public.appointments where id = v_ap1) = 'confirmado' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] resposta repetida não muda status';
    else v_rel := v_rel || E'\n[FALHOU] repetida: ' || v_j::text; end if;

    -- 8. JID por telefone (sem 9º dígito) acha o lembrete; "sair" => opt-out
    v_total := v_total + 1;
    update public.appointment_whatsapp_messages set chat_jid = null where id = v_msg;
    v_j := public.whatsapp_register_reply('557999122107@s.whatsapp.net', 'SAIR', null);
    if v_j->>'result' = 'opt_out' and (select whatsapp_opt_out from public.patients where id = v_p1) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] JID sem 9º dígito casa pelo telefone; SAIR grava opt-out';
    else v_rel := v_rel || E'\n[FALHOU] opt-out: ' || v_j::text; end if;

    -- 9. chat desconhecido
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('111@lid', 'sim', null);
    if v_j->>'result' = 'not_found' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] chat desconhecido => not_found';
    else v_rel := v_rel || E'\n[FALHOU] desconhecido: ' || v_j::text; end if;

    -- 10. dono da outra clínica não vê o log; anon/authenticated não executam as RPCs
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.appointment_whatsapp_messages where clinic_id = v_clinic;
    begin
        perform public.whatsapp_claim_due_reminders(1);
        v_rel := v_rel || E'\n[FALHOU] authenticated executou claim';
    exception when insufficient_privilege then
        if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] outra clínica não vê log nem chama RPC';
        else v_rel := v_rel || E'\n[FALHOU] outra clínica viu ' || v_n || ' linhas'; end if;
    end;
    reset role;

    raise exception 'RELATÓRIO 0038 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
