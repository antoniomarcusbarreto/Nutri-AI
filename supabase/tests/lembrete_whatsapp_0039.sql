-- ============================================================================
-- Verificação da migration 0039 (lembrete pelo WhatsApp disparado manualmente).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0039 — 9/9 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_other  uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();        -- dono/nutri da clínica
    v_x  uuid := gen_random_uuid();        -- dono da outra clínica
    v_p1 uuid := gen_random_uuid();        -- paciente com telefone
    v_p2 uuid := gen_random_uuid();        -- paciente sem telefone
    v_ap1 uuid := gen_random_uuid();       -- pendente, +20 h
    v_ap2 uuid := gen_random_uuid();       -- já confirmado
    v_ap3 uuid := gen_random_uuid();       -- pendente, já passou
    v_ap4 uuid := gen_random_uuid();       -- pendente, paciente sem telefone
    v_ap5 uuid := gen_random_uuid();       -- pendente, +20 h (fluxo completo)
    v_tok5 uuid;
    v_j jsonb;
    v_n int;
    v_msg uuid;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           'wa0039-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
    from unnest(array[v_a, v_x]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Nutri A', true), (v_x, 'Nutri X', true);
    -- lembrete automático DESLIGADO: o manual funciona mesmo assim
    insert into public.clinics (id, name, owner_id, plan_level, whatsapp_reminders_enabled, whatsapp_reminder_hours) values
        (v_clinic, 'Clínica WA 0039', v_a, 'starter', false, 24),
        (v_other,  'Outra 0039',      v_x, 'starter', false, 24);
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_other, v_x, 'owner');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status) values
        (v_p1, v_clinic, v_a, 'Maria', '(79) 99912-2107', 'ativo'),
        (v_p2, v_clinic, v_a, 'Sem Fone', null, 'ativo');
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, date_time, status) values
        (v_ap1, v_clinic, v_p1, v_a, now() + interval '20 hours', 'pendente'),
        (v_ap2, v_clinic, v_p1, v_a, now() + interval '21 hours', 'confirmado'),
        (v_ap3, v_clinic, v_p1, v_a, now() - interval '2 hours',  'pendente'),
        (v_ap4, v_clinic, v_p2, v_a, now() + interval '20 hours', 'pendente'),
        (v_ap5, v_clinic, v_p1, v_a, now() + interval '22 hours', 'pendente');
    select public_token into v_tok5 from public.appointments where id = v_ap5;

    -- ------------------------------------------------ como o dono da clínica
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    -- 1. lote: só a pendente com telefone entra; motivos dos outros
    v_total := v_total + 1;
    v_j := public.whatsapp_request_reminders(array[v_ap1, v_ap2, v_ap3, v_ap4, gen_random_uuid()]);
    if (v_j->>'requested')::int = 1
       and v_j->'skipped' @> jsonb_build_array(jsonb_build_object('appointment_id', v_ap2, 'reason', 'not_pending'))
       and v_j->'skipped' @> jsonb_build_array(jsonb_build_object('appointment_id', v_ap3, 'reason', 'past'))
       and v_j->'skipped' @> jsonb_build_array(jsonb_build_object('appointment_id', v_ap4, 'reason', 'no_phone'))
       and jsonb_array_length(v_j->'skipped') = 4 then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] lote: confirmado/passado/sem fone ficam de fora';
    else v_rel := v_rel || E'\n[FALHOU] lote: ' || v_j::text; end if;

    -- 2. pedir de novo => already_requested
    v_total := v_total + 1;
    v_j := public.whatsapp_request_reminders(array[v_ap1]);
    if (v_j->>'requested')::int = 0 and v_j->'skipped'->0->>'reason' = 'already_requested' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] pedido repetido não duplica';
    else v_rel := v_rel || E'\n[FALHOU] repetido: ' || v_j::text; end if;

    -- 3. a equipe vê o pedido na fila
    v_total := v_total + 1;
    select count(*) into v_n from public.appointment_whatsapp_messages
     where appointment_id = v_ap1 and status = 'requested' and kind = 'manual';
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] equipe vê o pedido na fila';
    else v_rel := v_rel || E'\n[FALHOU] equipe vê ' || v_n || ' pedidos'; end if;

    -- 4. outra clínica não consegue pedir
    v_total := v_total + 1;
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    v_j := public.whatsapp_request_reminders(array[v_ap5]);
    if (v_j->>'requested')::int = 0 and v_j->'skipped'->0->>'reason' = 'not_found' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] outra clínica não dispara';
    else v_rel := v_rel || E'\n[FALHOU] outra clínica: ' || v_j::text; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_j := public.whatsapp_request_reminders(array[v_ap5]);
    reset role;

    -- 5. paciente confirma ANTES do disparo => pedido descartado, nada sai
    v_total := v_total + 1;
    update public.appointments set status = 'confirmado' where id = v_ap1;
    perform 1 from public.whatsapp_claim_due_reminders(100) r
     where r.token = (select public_token from public.appointments where id = v_ap1);
    if not found and exists (select 1 from public.appointment_whatsapp_messages
                             where appointment_id = v_ap1 and status = 'skipped') then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] confirmou antes do envio => pedido descartado';
    else v_rel := v_rel || E'\n[FALHOU] pedido de consulta confirmada foi enviado'; end if;

    -- 6. o mesmo claim reservou o pedido válido, mesmo com o automático desligado
    v_total := v_total + 1;
    select m.id into v_msg from public.appointment_whatsapp_messages m
     where m.appointment_id = v_ap5 and m.kind = 'manual' and m.status = 'queued';
    if v_msg is not null then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] pedido manual reservado para envio (automático desligado)';
    else v_rel := v_rel || E'\n[FALHOU] pedido manual não foi reservado'; end if;
    perform public.whatsapp_mark_sent(v_msg, 'PROV-39', '777@lid', null);

    -- 7. automático (ligado agora) não repete quem recebeu o manual na janela
    v_total := v_total + 1;
    update public.clinics set whatsapp_reminders_enabled = true where id = v_clinic;
    perform 1 from public.whatsapp_claim_due_reminders(100) r where r.token = v_tok5;
    if not found then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] automático não repete o manual';
    else v_rel := v_rel || E'\n[FALHOU] automático repetiu'; end if;

    -- 8. novo manual logo em seguida => too_soon
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_j := public.whatsapp_request_reminders(array[v_ap5]);
    reset role;
    if v_j->'skipped'->0->>'reason' = 'too_soon' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] intervalo mínimo entre envios manuais';
    else v_rel := v_rel || E'\n[FALHOU] too_soon: ' || v_j::text; end if;

    -- 9. paciente confirma pelo botão do manual; depois disso nada mais é pedido
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('777@lid', null, 'confirmar:' || v_tok5);
    -- passa o intervalo mínimo, para o motivo ser o status e não o too_soon
    update public.appointment_whatsapp_messages set sent_at = now() - interval '7 hours' where id = v_msg;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    if v_j->>'result' = 'ok'
       and (public.whatsapp_request_reminders(array[v_ap5]))->'skipped'->0->>'reason' = 'not_pending' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] confirmado pelo botão do manual; não recebe de novo';
    else v_rel := v_rel || E'\n[FALHOU] botão manual: ' || v_j::text; end if;
    reset role;

    raise exception 'RELATÓRIO 0039 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
