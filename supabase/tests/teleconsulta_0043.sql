-- ============================================================================
-- Verificação da migration 0043 (teleconsulta, fase 1).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0043 — 9/9 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();   -- nutricionista responsável
    v_b  uuid := gen_random_uuid();   -- outro nutricionista (com acesso concedido ao paciente)
    v_s  uuid := gen_random_uuid();   -- secretária
    v_pu uuid := gen_random_uuid();   -- usuário do portal do paciente
    v_qu uuid := gen_random_uuid();   -- usuário do portal de OUTRO paciente
    v_p  uuid := gen_random_uuid();
    v_q  uuid := gen_random_uuid();
    v_svc uuid := gen_random_uuid();
    v_appt uuid := gen_random_uuid();
    v_req uuid := gen_random_uuid();
    v_new uuid;
    v_n int;
    v_t text;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           't0043-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
      from unnest(array[v_a, v_b, v_s, v_pu, v_qu]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Ana Nutri', true), (v_b, 'Bruno Nutri', true), (v_s, 'Sara Secretária', true),
        (v_pu, 'Paula Paciente', true), (v_qu, 'Quésia Paciente', true);
    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica 0043', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_clinic, v_b, 'nutritionist'), (v_clinic, v_s, 'secretary');
    insert into public.services (id, clinic_id, name, duration_minutes, price, modality) values
        (v_svc, v_clinic, 'Consulta online', 50, 200, 'online');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status, user_id, portal_access_until) values
        (v_p, v_clinic, v_a, 'Paula', '(79) 99900-0001', 'ativo', v_pu, now() + interval '30 days'),
        (v_q, v_clinic, v_a, 'Quésia', '(79) 99900-0002', 'ativo', v_qu, now() + interval '30 days');
    insert into public.patient_access_grants (clinic_id, owner_nutritionist_id, grantee_id, patient_id, status, requested_by, decided_by)
    values (v_clinic, v_a, v_b, v_p, 'approved', v_b, v_a);
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, service_id, date_time, status, modality)
    values (v_appt, v_clinic, v_p, v_a, v_svc, now() + interval '5 minutes', 'confirmado', 'online');

    -- 1. padrão da coluna nova é presencial
    v_total := v_total + 1;
    insert into public.appointments (clinic_id, patient_id, nutritionist_id, service_id, date_time, status)
    values (v_clinic, v_q, v_a, v_svc, now() + interval '2 days', 'pendente') returning id into v_new;
    select modality into v_t from public.appointments where id = v_new;
    if v_t = 'presencial' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] modalidade padrão presencial';
    else v_rel := v_rel || E'\n[FALHOU] modalidade padrão: ' || coalesce(v_t, 'null'); end if;

    -- 2. nutricionista responsável entra como nutricionista, com fim calculado
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select role into v_t from public.teleconsult_appointment(v_appt);
    select count(*) into v_n from public.teleconsult_appointment(v_appt) t
     where t.ends_at = t.starts_at + interval '50 minutes' and t.feature_enabled;
    reset role;
    if v_t = 'nutricionista' and v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] responsável entra como nutricionista';
    else v_rel := v_rel || E'\n[FALHOU] responsável: ' || coalesce(v_t, 'nada') || ' / ' || v_n; end if;

    -- 3. secretária não entra
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.teleconsult_appointment(v_appt);
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não entra';
    else v_rel := v_rel || E'\n[FALHOU] secretária recebeu a consulta'; end if;

    -- 4. outro nutricionista, mesmo com acesso concedido ao paciente, não entra
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.teleconsult_appointment(v_appt);
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] outro nutricionista não entra';
    else v_rel := v_rel || E'\n[FALHOU] outro nutricionista recebeu a consulta'; end if;

    -- 5. o paciente da consulta entra como paciente
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pu, 'role', 'authenticated')::text, true);
    select role into v_t from public.teleconsult_appointment(v_appt);
    reset role;
    if v_t = 'paciente' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] paciente entra como paciente';
    else v_rel := v_rel || E'\n[FALHOU] paciente: ' || coalesce(v_t, 'nada'); end if;

    -- 6. outro paciente não entra
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_qu, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.teleconsult_appointment(v_appt);
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] outro paciente não entra';
    else v_rel := v_rel || E'\n[FALHOU] outro paciente recebeu a consulta'; end if;

    -- 7. teleconsult_rooms é invisível para quem usa o app
    v_total := v_total + 1;
    insert into public.teleconsult_rooms (appointment_id, clinic_id, room_name, room_url, not_before, expires_at)
    values (v_appt, v_clinic, 't0043room', 'https://exemplo.daily.co/t0043room', now(), now() + interval '2 hours');
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        select count(*) into v_n from public.teleconsult_rooms;
        reset role;
        v_rel := v_rel || E'\n[FALHOU] authenticated leu teleconsult_rooms (' || v_n || ')';
    exception when insufficient_privilege then
        reset role;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] salas inacessíveis ao app';
    end;

    -- 8. pedido aceito vira consulta com a modalidade pedida
    v_total := v_total + 1;
    insert into public.appointment_change_requests (id, patient_id, clinic_id, kind, nutritionist_id, service_id, requested_at, duration_minutes, modality)
    values (v_req, v_q, v_clinic, 'booking', v_a, v_svc, now() + interval '3 days', 50, 'online');
    v_new := public._apply_change_request(v_req, now() + interval '3 days', v_a, 50);
    select modality into v_t from public.appointments where id = v_new;
    if v_t = 'online' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] pedido aceito mantém a modalidade';
    else v_rel := v_rel || E'\n[FALHOU] modalidade do pedido aceito: ' || coalesce(v_t, 'null'); end if;

    -- 9. o portal mostra a modalidade da consulta (não a do serviço)
    v_total := v_total + 1;
    update public.appointments set modality = 'presencial' where id = v_appt;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_pu, 'role', 'authenticated')::text, true);
    select pa.modality into v_t from public.portal_appointments() pa where pa.id = v_appt;
    reset role;
    if v_t = 'presencial' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] portal usa a modalidade da consulta';
    else v_rel := v_rel || E'\n[FALHOU] portal_appointments: ' || coalesce(v_t, 'null'); end if;

    raise exception 'RELATÓRIO 0043 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
