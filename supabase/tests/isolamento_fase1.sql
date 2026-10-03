-- ============================================================================
-- Verificação da Fase 1 (migration 0029) — matriz de isolamento por papel.
--
-- Bloco único, autocontido: cria dentro da transação uma clínica de teste
-- (dono-nutri A, nutri B, secretária S, pacientes de A e de B, um Master),
-- simula cada usuário com `set local role authenticated` + request.jwt.claims
-- e termina com um ERRO PROPOSITAL cuja mensagem é o relatório. O erro desfaz
-- tudo — nada é gravado. Esperado: "RELATÓRIO FASE 1 — N/N ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a      uuid := gen_random_uuid();   -- dono da clínica, nutricionista
    v_b      uuid := gen_random_uuid();   -- nutricionista
    v_s      uuid := gen_random_uuid();   -- secretária
    v_m      uuid := gen_random_uuid();   -- Master da plataforma
    v_pa     uuid := gen_random_uuid();   -- paciente de A
    v_pa2    uuid := gen_random_uuid();   -- outro paciente de A
    v_pb     uuid := gen_random_uuid();   -- paciente de B
    v_ap_a   uuid := gen_random_uuid();   -- consulta agendada de A (paciente de A)
    v_ap_b   uuid := gen_random_uuid();   -- consulta agendada de B (paciente de B)
    v_grant  uuid;
    v_n      int;
    v_total  int := 0;
    v_ok     int := 0;
    v_rel    text := '';
begin
    -- ------------------------------------------------ cenário (como postgres)
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           'fase1-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
    from unnest(array[v_a, v_b, v_s, v_m]) u;

    insert into public.profiles (id, full_name, is_active, is_superadmin) values
        (v_a, 'Nutri A (dono)', true, false), (v_b, 'Nutri B', true, false),
        (v_s, 'Secretária S', true, false),   (v_m, 'Master Teste', true, true);

    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica Teste', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_clinic, v_b, 'nutritionist'), (v_clinic, v_s, 'secretary');

    insert into public.patients (id, clinic_id, nutritionist_id, name, status) values
        (v_pa, v_clinic, v_a, 'Paciente da A', 'ativo'),
        (v_pa2, v_clinic, v_a, 'Outro paciente da A', 'ativo'),
        (v_pb, v_clinic, v_b, 'Paciente do B', 'ativo');
    insert into public.patient_health (patient_id, allergies) values
        (v_pa, 'amendoim'), (v_pa2, 'lactose'), (v_pb, 'glúten');
    -- consultations.appointment_id é obrigatório: agendamentos primeiro.
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, date_time, status) values
        (v_ap_a, v_clinic, v_pa, v_a, now() + interval '1 day', 'pendente'),
        (v_ap_b, v_clinic, v_pb, v_b, now() + interval '1 day', 'pendente');
    insert into public.consultations (clinic_id, appointment_id, patient_id, anamnese_notes) values
        (v_clinic, v_ap_a, v_pa, 'prontuário de A'), (v_clinic, v_ap_b, v_pb, 'prontuário de B');
    insert into public.meal_plans (clinic_id, patient_id, nutritionist_id, kcal, meals) values
        (v_clinic, v_pa, v_a, 1800, '[]'), (v_clinic, v_pb, v_b, 2000, '[]');
    insert into public.patient_exams (patient_id, professional_id, file_url) values
        (v_pa, v_a, 'x'), (v_pb, v_b, 'y');

    -- ------------------------------------------------ Nutri B
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select count(*) into v_n from public.patients where clinic_id = v_clinic;
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B vê só o próprio paciente (1)';
    else v_rel := v_rel || E'\n[FALHOU] B vê ' || v_n || ' pacientes (esperado 1)'; end if;

    v_total := v_total + 1;
    select (select count(*) from public.consultations where clinic_id = v_clinic)
         + (select count(*) from public.patient_health where patient_id in (v_pa, v_pa2))
         + (select count(*) from public.meal_plans where patient_id = v_pa)
         + (select count(*) from public.patient_exams where patient_id = v_pa) into v_n;
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B não vê prontuário/saúde/plano/exame de A';
    else v_rel := v_rel || E'\n[FALHOU] B vê ' || v_n || ' registros clínicos (esperado 1 = a própria consulta)'; end if;

    v_total := v_total + 1;
    begin
        insert into public.consultations (clinic_id, appointment_id, patient_id, anamnese_notes)
        values (v_clinic, v_ap_a, v_pa, 'invasão');
        v_rel := v_rel || E'\n[FALHOU] B gravou consulta em paciente de A';
    exception
        -- Só conta como acerto se quem barrou foi o RLS (42501), não outro erro.
        when insufficient_privilege then
            v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B não grava consulta em paciente de A — ' || sqlerrm;
        when others then
            v_rel := v_rel || E'\n[FALHOU] B gravando consulta: erro inesperado — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        v_grant := public.request_patient_access(v_a, v_pa, 'interconsulta');
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B pede acesso ao paciente da A';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] B pede acesso — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        perform public.decide_patient_access(v_grant, true, null);
        v_rel := v_rel || E'\n[FALHOU] B aprovou o próprio pedido';
    exception when others then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B não aprova o próprio pedido — ' || sqlerrm;
    end;

    -- ------------------------------------------------ Nutri A aprova
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select count(*) into v_n from public.patients where clinic_id = v_clinic;
    if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono A vê só os próprios pacientes (2)';
    else v_rel := v_rel || E'\n[FALHOU] dono A vê ' || v_n || ' pacientes (esperado 2)'; end if;

    v_total := v_total + 1;
    select count(*) into v_n from public.consultations where patient_id = v_pb;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono A não vê prontuário do paciente de B';
    else v_rel := v_rel || E'\n[FALHOU] dono A vê prontuário de B'; end if;

    v_total := v_total + 1;
    begin
        perform public.decide_patient_access(v_grant, true, now() + interval '30 days');
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] A aprova o pedido de B (30 dias)';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] A aprova — ' || sqlerrm;
    end;

    -- ------------------------------------------------ Nutri B com acesso
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select (select count(*) from public.patient_health where patient_id = v_pa)
         + (select count(*) from public.consultations where patient_id = v_pa) into v_n;
    if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] após aprovação, B vê saúde + prontuário do paciente concedido';
    else v_rel := v_rel || E'\n[FALHOU] após aprovação, B vê ' || v_n || ' (esperado 2)'; end if;

    v_total := v_total + 1;
    select count(*) into v_n from public.patient_health where patient_id = v_pa2;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] concessão de 1 paciente não abre os outros de A';
    else v_rel := v_rel || E'\n[FALHOU] B vê outro paciente de A não concedido'; end if;

    -- ------------------------------------------------ A revoga
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    perform public.revoke_patient_access(v_grant);

    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_total := v_total + 1;
    select count(*) into v_n from public.patient_health where patient_id = v_pa;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] após revogação, B perde o acesso';
    else v_rel := v_rel || E'\n[FALHOU] B ainda vê após revogação'; end if;

    -- ------------------------------------------------ Secretária
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select count(*) into v_n from public.patients where clinic_id = v_clinic;
    if v_n = 3 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária vê o cadastro de todos (3)';
    else v_rel := v_rel || E'\n[FALHOU] secretária vê ' || v_n || ' pacientes (esperado 3)'; end if;

    v_total := v_total + 1;
    select count(*) into v_n from public.appointments where clinic_id = v_clinic;
    if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária vê a agenda inteira (2)';
    else v_rel := v_rel || E'\n[FALHOU] secretária vê ' || v_n || ' agendamentos (esperado 2)'; end if;

    v_total := v_total + 1;
    select (select count(*) from public.patient_health where patient_id in (v_pa, v_pa2, v_pb))
         + (select count(*) from public.consultations where clinic_id = v_clinic)
         + (select count(*) from public.meal_plans where clinic_id = v_clinic)
         + (select count(*) from public.patient_exams where patient_id in (v_pa, v_pa2, v_pb)) into v_n;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não vê nenhum dado clínico';
    else v_rel := v_rel || E'\n[FALHOU] secretária vê ' || v_n || ' registros clínicos'; end if;

    v_total := v_total + 1;
    begin
        perform public.create_patient_account(v_clinic, 'Novo do B', '000',
            'fase1-novo-' || gen_random_uuid() || '@exemplo.com', '0', 'ativo', 'senha-123456', null, null, null, v_b);
        select count(*) into v_n from public.patients where clinic_id = v_clinic and nutritionist_id = v_b;
        if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária cadastra paciente para B';
        else v_rel := v_rel || E'\n[FALHOU] secretária cadastrou, mas B tem ' || v_n; end if;
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] secretária cadastra paciente — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        update public.patients set nutritionist_id = v_a where id = v_pb;
        v_rel := v_rel || E'\n[FALHOU] secretária trocou o responsável do paciente';
    exception when others then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não troca o responsável — ' || sqlerrm;
    end;

    -- ------------------------------------------------ Master
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_m, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select (select count(*) from public.patients where clinic_id = v_clinic)
         + (select count(*) from public.patient_health where patient_id in (v_pa, v_pa2, v_pb))
         + (select count(*) from public.consultations where clinic_id = v_clinic)
         + (select count(*) from public.patient_exams where patient_id in (v_pa, v_pa2, v_pb)) into v_n;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] Master não lê pacientes nem dados clínicos';
    else v_rel := v_rel || E'\n[FALHOU] Master lê ' || v_n || ' registros de pacientes'; end if;

    v_total := v_total + 1;
    begin
        perform public.master_grant_patient_access(v_a, v_b, null, null, 'suporte');
        perform public.master_reassign_patient(v_pa2, v_b);
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] Master concede acesso e transfere paciente';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] Master concede/transfere — ' || sqlerrm;
    end;

    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    v_total := v_total + 1;
    select count(*) into v_n from public.patient_health where patient_id in (v_pa, v_pa2);
    if v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] B vê o paciente transferido e os concedidos pelo Master';
    else v_rel := v_rel || E'\n[FALHOU] B vê ' || v_n || ' após concessão/transferência (esperado 2)'; end if;

    reset role;
    raise exception 'RELATÓRIO FASE 1 — %/% ok (erro proposital; nada foi gravado)%', v_ok, v_total, v_rel;
end $$;
