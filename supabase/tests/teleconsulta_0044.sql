-- ============================================================================
-- Verificação da migration 0044 (teleconsulta, fase 2: consentimento e
-- transcrição). Precisa da 0043 aplicada. Bloco único e autocontido; termina
-- com ERRO PROPOSITAL cuja mensagem é o relatório — tudo é desfeito.
-- Esperado: "RELATÓRIO 0044 — 13/13 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();   -- nutricionista da consulta
    v_b  uuid := gen_random_uuid();   -- outro nutricionista (com acesso concedido ao paciente)
    v_s  uuid := gen_random_uuid();   -- secretária
    v_pu uuid := gen_random_uuid();   -- usuário do portal do paciente
    v_p  uuid := gen_random_uuid();
    v_svc uuid := gen_random_uuid();
    v_appt uuid := gen_random_uuid();
    v_t uuid;
    v_share uuid;
    v_n int;
    v_b2 boolean;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           't0044-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
      from unnest(array[v_a, v_b, v_s, v_pu]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Ana Nutri', true), (v_b, 'Bruno Nutri', true), (v_s, 'Sara Secretária', true), (v_pu, 'Paula Paciente', true);
    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica 0044', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_clinic, v_b, 'nutritionist'), (v_clinic, v_s, 'secretary');
    insert into public.services (id, clinic_id, name, duration_minutes, price, modality) values
        (v_svc, v_clinic, 'Consulta online', 50, 200, 'online');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status, user_id, portal_access_until) values
        (v_p, v_clinic, v_a, 'Paula', '(79) 99900-0001', 'ativo', v_pu, now() + interval '30 days');
    insert into public.patient_access_grants (clinic_id, owner_nutritionist_id, grantee_id, patient_id, status, requested_by, decided_by)
    values (v_clinic, v_a, v_b, v_p, 'approved', v_b, v_a);
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, service_id, date_time, status, modality)
    values (v_appt, v_clinic, v_p, v_a, v_svc, now() + interval '5 minutes', 'confirmado', 'online');

    -- 1. sem aceite do paciente, não começa
    v_total := v_total + 1;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        perform public.start_teleconsult_transcript(v_appt);
        reset role;
        v_rel := v_rel || E'\n[FALHOU] começou sem aceite';
    exception when others then
        reset role;
        if sqlstate = '42501' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] sem aceite não transcreve';
        else v_rel := v_rel || E'\n[FALHOU] sem aceite: ' || sqlerrm; end if;
    end;

    -- 2. paciente aceita pelo portal
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pu, 'role', 'authenticated')::text, true);
    perform public.portal_teleconsult_consent(v_appt, 'aceito', 'tele-2026-10-v1', 'teste');
    reset role;
    if public.teleconsult_has_consent(v_appt) then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] aceite registrado';
    else v_rel := v_rel || E'\n[FALHOU] aceite não registrado'; end if;

    -- 3. nutricionista começa e grava trechos
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_t := public.start_teleconsult_transcript(v_appt);
    insert into public.teleconsult_transcript_segments (id, transcript_id, speaker, text, spoken_at) values
        (gen_random_uuid(), v_t, 'paciente', 'Tenho sentido muito cansaço à tarde.', now()),
        (gen_random_uuid(), v_t, 'nutricionista', 'Vamos ajustar o lanche da tarde.', now() + interval '5 seconds');
    select count(*) into v_n from public.teleconsult_transcript_segments where transcript_id = v_t;
    reset role;
    if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] nutricionista grava trechos';
    else v_rel := v_rel || E'\n[FALHOU] trechos gravados: ' || v_n; end if;

    -- 4. secretária não lê nada
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
    select (select count(*) from public.teleconsult_transcripts) + (select count(*) from public.teleconsult_transcript_segments) into v_n;
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não lê transcrição';
    else v_rel := v_rel || E'\n[FALHOU] secretária leu ' || v_n || ' linhas'; end if;

    -- 5. outro nutricionista com acesso ao paciente não lê sem compartilhamento
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.teleconsult_transcripts;
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] acesso ao paciente não abre a transcrição';
    else v_rel := v_rel || E'\n[FALHOU] outro nutricionista leu a transcrição'; end if;

    -- 6. paciente não lê a transcrição
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pu, 'role', 'authenticated')::text, true);
    select (select count(*) from public.teleconsult_transcripts) + (select count(*) from public.teleconsult_transcript_segments) into v_n;
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] paciente não lê a transcrição';
    else v_rel := v_rel || E'\n[FALHOU] paciente leu ' || v_n || ' linhas'; end if;

    -- 7. paciente revoga: trecho novo é recusado
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pu, 'role', 'authenticated')::text, true);
    perform public.portal_teleconsult_consent(v_appt, 'revogado', 'tele-2026-10-v1', 'teste');
    reset role;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        insert into public.teleconsult_transcript_segments (id, transcript_id, speaker, text, spoken_at)
        values (gen_random_uuid(), v_t, 'paciente', 'depois da revogação', now());
        reset role;
        v_rel := v_rel || E'\n[FALHOU] gravou depois da revogação';
    exception when others then
        reset role;
        if sqlstate = '42501' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] revogação bloqueia trechos novos';
        else v_rel := v_rel || E'\n[FALHOU] revogação: ' || sqlerrm; end if;
    end;

    -- 8. fim da chamada vira rascunho; salvar leva ao histórico
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_b2 := public.finish_teleconsult_transcript(v_t);
    select count(*) into v_n from public.teleconsult_transcripts where id = v_t and status = 'rascunho';
    perform public.save_teleconsult_transcript(v_t, '{"resumo_geral":"Cansaço à tarde."}'::jsonb);
    reset role;
    if v_b2 and v_n = 1 and exists (select 1 from public.teleconsult_transcripts where id = v_t and status = 'salva' and saved_at is not null) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] rascunho → salva no histórico';
    else v_rel := v_rel || E'\n[FALHOU] rascunho/salvar'; end if;

    -- 9. secretária não pode receber compartilhamento
    v_total := v_total + 1;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        perform public.share_teleconsult_transcript(v_t, v_s);
        reset role;
        v_rel := v_rel || E'\n[FALHOU] compartilhou com a secretária';
    exception when others then
        reset role;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não recebe compartilhamento';
    end;

    -- 10. compartilhada com B: B lê transcrição e trechos
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.share_teleconsult_transcript(v_t, v_b);
    select id into v_share from public.teleconsult_transcript_shares where transcript_id = v_t and grantee_id = v_b;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select (select count(*) from public.teleconsult_transcripts) + (select count(*) from public.teleconsult_transcript_segments) into v_n;
    reset role;
    if v_n = 3 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] compartilhada: B lê';
    else v_rel := v_rel || E'\n[FALHOU] B depois do compartilhamento leu ' || v_n; end if;

    -- 11. B não edita o resumo de outra pessoa
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    update public.teleconsult_transcripts set summary = '{"resumo_geral":"alterado"}'::jsonb where id = v_t;
    reset role;
    if (select summary->>'resumo_geral' from public.teleconsult_transcripts where id = v_t) = 'Cansaço à tarde.' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] quem recebe só lê';
    else v_rel := v_rel || E'\n[FALHOU] B alterou o resumo'; end if;

    -- 12. revogado: B deixa de ler
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.revoke_teleconsult_share(v_share);
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.teleconsult_transcripts;
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] revogar tira o acesso';
    else v_rel := v_rel || E'\n[FALHOU] B ainda lê depois de revogado'; end if;

    -- 13. dono exclui: some transcrição e trechos
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    delete from public.teleconsult_transcripts where id = v_t;
    reset role;
    if not exists (select 1 from public.teleconsult_transcripts where id = v_t)
       and not exists (select 1 from public.teleconsult_transcript_segments where transcript_id = v_t) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] excluir apaga tudo';
    else v_rel := v_rel || E'\n[FALHOU] exclusão'; end if;

    raise exception 'RELATÓRIO 0044 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
