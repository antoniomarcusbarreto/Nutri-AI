-- ============================================================================
-- Verificação da migration 0042 (triagem de novos pacientes / leads).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0042 — 14/14 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();   -- dono do link
    v_b  uuid := gen_random_uuid();   -- outro nutricionista da clínica
    v_s  uuid := gen_random_uuid();   -- secretária
    v_p  uuid := gen_random_uuid();   -- paciente de A
    v_slug text := 't0042-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_lead_new uuid;
    v_lead_old uuid;
    v_new_patient uuid;
    v_n int;
    v_t text;
    v_j jsonb;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           't0042-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
      from unnest(array[v_a, v_b, v_s]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Ana Nutri', true), (v_b, 'Bruno Nutri', true), (v_s, 'Sara Secretária', true);
    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica 0042', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_clinic, v_b, 'nutritionist'), (v_clinic, v_s, 'secretary');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status) values
        (v_p, v_clinic, v_a, 'Maria Antiga', '(79) 99912-2107', 'inativo');
    insert into public.lead_forms (nutritionist_id, clinic_id, slug) values (v_a, v_clinic, v_slug);

    -- IP fixo do teste (o limite por IP não conta o tráfego real)
    perform set_config('request.headers', json_build_object('x-forwarded-for', '203.0.113.' || (random() * 200)::int)::text, true);

    -- 1. anon lê o cabeçalho do formulário
    v_total := v_total + 1;
    set local role anon;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    v_j := public.get_lead_form_public(upper(v_slug));
    reset role;
    if v_j->>'nutritionist_name' = 'Ana Nutri' and v_j->>'clinic_name' = 'Clínica 0042' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] cabeçalho público do link';
    else v_rel := v_rel || E'\n[FALHOU] cabeçalho: ' || coalesce(v_j::text, 'null'); end if;

    -- 2. sem consentimento de saúde: recusa
    v_total := v_total + 1;
    begin
        set local role anon;
        perform public.submit_lead(v_slug, jsonb_build_object('name', 'Joana', 'phone', '(11) 98888-7777', 'goal', 'emagrecimento'));
        reset role;
        v_rel := v_rel || E'\n[FALHOU] aceitou sem consentimento';
    exception when others then
        reset role;
        if sqlstate = '22023' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] exige consentimento de saúde';
        else v_rel := v_rel || E'\n[FALHOU] consentimento: ' || sqlerrm; end if;
    end;

    -- 3. lead novo + 4. reenvio da mesma pessoa não duplica
    set local role anon;
    perform public.submit_lead(v_slug, jsonb_build_object(
        'name', 'Joana', 'phone', '+55 (11) 98888-7777', 'goal', 'emagrecimento', 'consent_health', true,
        'conditions', jsonb_build_array('diabetes', 'invalida'), 'pregnancy', 'gestante',
        'allergies', 'Lactose', 'weight_kg', '72,5', 'had_nutritionist', 'talvez'));
    perform public.submit_lead(v_slug, jsonb_build_object(
        'name', 'Joana Silva', 'phone', '11988887777', 'goal', 'emagrecimento', 'consent_health', true,
        'conditions', jsonb_build_array('diabetes', 'invalida'), 'pregnancy', 'gestante',
        'allergies', 'Lactose', 'weight_kg', '72,5', 'email', 'joana@exemplo.com'));
    reset role;
    v_total := v_total + 1;
    select count(*) into v_n from public.leads where nutritionist_id = v_a and phone_digits = '11988887777';
    select id into v_lead_new from public.leads where nutritionist_id = v_a and phone_digits = '11988887777';
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] telefone normalizado e reenvio não duplica';
    else v_rel := v_rel || E'\n[FALHOU] leads da Joana: ' || v_n; end if;

    v_total := v_total + 1;
    if (select name = 'Joana Silva' and conditions = array['diabetes'] and weight_kg = 72.5 and had_nutritionist is null
          from public.leads where id = v_lead_new) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] valores inválidos descartados, reenvio atualiza';
    else v_rel := v_rel || E'\n[FALHOU] saneamento dos campos'; end if;

    -- 5. paciente antigo (mesmo WhatsApp) é reconhecido pelo dono do link
    set local role anon;
    perform public.submit_lead(v_slug, jsonb_build_object(
        'name', 'Maria', 'phone', '79 99912 2107', 'goal', 'saude', 'consent_health', true, 'email', 'maria@exemplo.com'));
    reset role;
    select id into v_lead_old from public.leads where nutritionist_id = v_a and phone_digits = '79999122107';

    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    select public.lead_patient_match(l) into v_new_patient from public.leads l where l.id = v_lead_old;
    select count(*) into v_n from public.leads;
    reset role;
    if v_new_patient = v_p and v_n = 2 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono vê os 2 pedidos e reconhece paciente antigo';
    else v_rel := v_rel || E'\n[FALHOU] match/listagem: ' || coalesce(v_new_patient::text, 'null') || ' / ' || v_n; end if;

    -- 6. anon não lê a tabela
    v_total := v_total + 1;
    begin
        set local role anon;
        perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
        select count(*) into v_n from public.leads;
        reset role;
        v_rel := v_rel || E'\n[FALHOU] anon leu leads (' || v_n || ')';
    exception when insufficient_privilege then
        reset role;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] anon sem acesso direto';
    end;

    -- 7. outro nutricionista e secretária não veem
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
    select count(*) into v_n from public.leads;
    perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);
    select v_n + count(*) into v_n from public.leads;
    reset role;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] colega e secretária não veem os pedidos';
    else v_rel := v_rel || E'\n[FALHOU] colega/secretária viram ' || v_n; end if;

    -- 8. dono não altera as respostas (só andamento/triagem)
    v_total := v_total + 1;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        update public.leads set name = 'Outro' where id = v_lead_new;
        reset role;
        v_rel := v_rel || E'\n[FALHOU] dono alterou o nome';
    exception when insufficient_privilege then
        reset role;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] respostas imutáveis para a equipe';
    end;

    -- 9. colega não aceita pedido de outro
    v_total := v_total + 1;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
        perform public.accept_lead(v_lead_new, null);
        reset role;
        v_rel := v_rel || E'\n[FALHOU] colega aceitou pedido alheio';
    exception when others then
        reset role;
        if sqlstate = '42501' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] colega não aceita pedido alheio';
        else v_rel := v_rel || E'\n[FALHOU] aceite alheio: ' || sqlerrm; end if;
    end;

    -- 10. aceitar pedido novo cadastra paciente com ficha
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_new_patient := public.accept_lead(v_lead_new, null);
    reset role;
    select h.pathologies into v_t from public.patient_health h where h.patient_id = v_new_patient;
    if (select nutritionist_id = v_a and main_goal = 'Emagrecimento' and email = 'joana@exemplo.com'
          from public.patients where id = v_new_patient)
       and v_t like '%Diabetes%' and v_t like '%Gestante%'
       and (select status = 'convertido' and converted_patient_id = v_new_patient from public.leads where id = v_lead_new) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] aceite cadastra paciente + ficha de saúde';
    else v_rel := v_rel || E'\n[FALHOU] aceite novo (patologias: ' || coalesce(v_t, 'null') || ')'; end if;

    -- 11. aceitar pedido de paciente antigo liga ao cadastro e só completa vazios
    v_total := v_total + 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    v_new_patient := public.accept_lead(v_lead_old, v_p);
    reset role;
    select count(*) into v_n from public.patients where clinic_id = v_clinic;
    if v_new_patient = v_p and v_n = 2
       and (select email = 'maria@exemplo.com' and name = 'Maria Antiga' and status = 'ativo' from public.patients where id = v_p) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] paciente antigo: liga, reativa e completa só o vazio';
    else v_rel := v_rel || E'\n[FALHOU] aceite de paciente antigo (' || v_n || ' pacientes)'; end if;

    -- 12. não aceita duas vezes
    v_total := v_total + 1;
    begin
        set local role authenticated;
        perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
        perform public.accept_lead(v_lead_old, null);
        reset role;
        v_rel := v_rel || E'\n[FALHOU] aceitou duas vezes';
    exception when others then
        reset role;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] não aceita duas vezes';
    end;

    -- 13. campo isca: finge sucesso e não grava
    v_total := v_total + 1;
    set local role anon;
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    perform public.submit_lead(v_slug, jsonb_build_object(
        'name', 'Robô', 'phone', '(21) 97777-6666', 'goal', 'outro', 'consent_health', true, 'website', 'http://spam'));
    reset role;
    if not exists (select 1 from public.leads where phone_digits = '21977776666') then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] campo isca descarta robô';
    else v_rel := v_rel || E'\n[FALHOU] robô gravou'; end if;

    -- 14. link pausado não recebe
    v_total := v_total + 1;
    update public.lead_forms set enabled = false where nutritionist_id = v_a;
    begin
        set local role anon;
        perform public.submit_lead(v_slug, jsonb_build_object(
            'name', 'Pedro', 'phone', '(31) 96666-5555', 'goal', 'esporte', 'consent_health', true));
        reset role;
        v_rel := v_rel || E'\n[FALHOU] link pausado recebeu';
    exception when others then
        reset role;
        if sqlstate = 'P0002' and public.get_lead_form_public(v_slug) is null then
            v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] link pausado não recebe nem abre';
        else v_rel := v_rel || E'\n[FALHOU] link pausado: ' || sqlerrm; end if;
    end;

    raise exception 'RELATÓRIO 0042 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
