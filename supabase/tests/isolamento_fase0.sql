-- ============================================================================
-- Verificação da Fase 0 (migration 0028).
--
-- Rodar inteiro no SQL Editor do Supabase (ou via execute_sql). É um bloco
-- único: simula paciente, dono e anon com `set local role` + request.jwt.claims
-- e, no fim, levanta um ERRO PROPOSITAL cuja mensagem é o relatório. O erro
-- desfaz tudo o que o teste fez — nada é gravado.
--
-- Esperado: a mensagem começa com "RELATÓRIO FASE 0 — 9/9 ok".
-- Sem tabelas temporárias: o SQL Editor não garante que elas sobrevivam entre
-- comandos (era a causa do erro 42P01 "relation _t does not exist").
-- ============================================================================
do $$
declare
    v_owner_id        uuid;
    v_clinic_id       uuid;
    v_master_id       uuid;
    v_master_email    text;
    v_patient_user_id uuid;
    v_new_patient     uuid;
    v_total int := 0;
    v_ok    int := 0;
    v_rel   text := '';
begin
    -- ids reais lidos como postgres, antes de trocar de papel
    select owner_id, id into v_owner_id, v_clinic_id from public.clinics order by created_at limit 1;
    select p.id, u.email into v_master_id, v_master_email
      from public.profiles p join auth.users u on u.id = p.id
     where p.is_superadmin order by p.created_at limit 1;
    select user_id into v_patient_user_id from public.patients where user_id is not null limit 1;

    -- ------------------------------------------------------------ paciente
    set local role authenticated;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_patient_user_id, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    begin
        update public.profiles set is_superadmin = true where id = auth.uid();
        v_rel := v_rel || E'\n[FALHOU] paciente NÃO vira Master — update passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] paciente NÃO vira Master — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        perform public.create_my_clinic('x', null, null, null, null, null, null, null, null, null);
        v_rel := v_rel || E'\n[FALHOU] paciente NÃO cria clínica — passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] paciente NÃO cria clínica — ' || sqlerrm;
    end;

    -- ------------------------------------------------------------ dono
    reset role;
    set local role authenticated;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_owner_id, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    begin
        perform public.create_patient_account(v_clinic_id, 'Teste', '000', v_master_email,
            '0', 'ativo', 'senha-qualquer', null, null, null);
        v_rel := v_rel || E'\n[FALHOU] dono NÃO vincula e-mail do Master como paciente — passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] dono NÃO vincula e-mail do Master como paciente — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        perform public.change_patient_password(v_master_id, 'senha-do-atacante');
        v_rel := v_rel || E'\n[FALHOU] dono NÃO troca senha do Master — passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] dono NÃO troca senha do Master — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        update public.clinics
           set subscription_status = 'active', subscription_end_date = now() + interval '10 years'
         where id = v_clinic_id;
        v_rel := v_rel || E'\n[FALHOU] dono NÃO estende a própria assinatura — update passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] dono NÃO estende a própria assinatura — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        insert into public.clinic_members (clinic_id, user_id, role)
        values (v_clinic_id, v_master_id, 'nutritionist');
        v_rel := v_rel || E'\n[FALHOU] dono NÃO insere membro direto na tabela — insert passou';
    exception when others then
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] dono NÃO insere membro direto na tabela — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        v_new_patient := public.create_patient_account(v_clinic_id, 'Paciente Teste', '000',
            'teste-isolamento-' || gen_random_uuid() || '@exemplo.com', '0', 'ativo',
            'senha-inicial', null, null, null);
        perform public.change_patient_password(v_new_patient, 'nova-senha-123');
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] dono cadastra paciente novo e troca a senha dele (bug #14 corrigido)';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] dono cadastra paciente novo e troca a senha dele — ' || sqlerrm;
    end;

    -- ------------------------------------------------------------ anon
    reset role;
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);

    v_total := v_total + 1;
    begin
        perform public.delete_user_master('00000000-0000-0000-0000-000000000000');
        v_rel := v_rel || E'\n[FALHOU] anon NÃO executa função interna — passou';
    exception
        when insufficient_privilege then
            v_ok := v_ok + 1;
            v_rel := v_rel || E'\n[ok] anon NÃO executa função interna — ' || sqlerrm;
        when others then
            v_rel := v_rel || E'\n[FALHOU] anon NÃO executa função interna — erro inesperado: ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        perform * from public.get_appointment_details_public('00000000-0000-0000-0000-000000000000');
        v_ok := v_ok + 1;
        v_rel := v_rel || E'\n[ok] anon executa RPC pública (link de confirmação)';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] anon executa RPC pública — ' || sqlerrm;
    end;

    reset role;

    -- Erro proposital: devolve o relatório e desfaz tudo o que o teste gravou.
    raise exception 'RELATÓRIO FASE 0 — %/% ok (erro proposital; nada foi gravado)%',
        v_ok, v_total, v_rel;
end $$;
