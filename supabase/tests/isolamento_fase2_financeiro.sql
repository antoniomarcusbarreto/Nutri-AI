-- ============================================================================
-- Verificação da migration 0030 (pendências do Financeiro).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0030 — 9/9 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();   -- dono, nutricionista
    v_b  uuid := gen_random_uuid();   -- nutricionista
    v_s  uuid := gen_random_uuid();   -- secretária
    v_pb uuid := gen_random_uuid();   -- paciente de B
    v_pay uuid := gen_random_uuid();  -- cobrança do paciente de B
    v_n  int;
    v_txt text;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    select '00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated',
           'fase2-' || u || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', ''
    from unnest(array[v_a, v_b, v_s]) u;
    insert into public.profiles (id, full_name, is_active) values
        (v_a, 'Nutri A (dono)', true), (v_b, 'Nutri B', true), (v_s, 'Secretária S', true);
    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica Teste 0030', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values
        (v_clinic, v_a, 'owner'), (v_clinic, v_b, 'nutritionist'), (v_clinic, v_s, 'secretary');
    insert into public.patients (id, clinic_id, nutritionist_id, name, status) values
        (v_pb, v_clinic, v_b, 'Paciente do B', 'ativo');
    insert into public.payments (id, clinic_id, patient_id, nutritionist_id, description, amount, status, due_date) values
        (v_pay, v_clinic, v_pb, v_b, 'Consulta', 200, 'pendente', current_date);
    insert into public.expenses (clinic_id, description, amount, due_date) values
        (v_clinic, 'Aluguel', 1500, current_date);

    -- ------------------------------------------------ Secretária
    set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_s, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    begin
        update public.payments set amount = 1 where id = v_pay;
        v_rel := v_rel || E'\n[FALHOU] secretária alterou o valor da cobrança';
    exception when insufficient_privilege then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não altera valor — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        update public.payments set due_date = current_date + 30 where id = v_pay;
        v_rel := v_rel || E'\n[FALHOU] secretária alterou o vencimento';
    exception when insufficient_privilege then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não altera vencimento';
    end;

    v_total := v_total + 1;
    begin
        update public.payments set discount = 20 where id = v_pay;
        v_rel := v_rel || E'\n[FALHOU] secretária deu desconto fora do recebimento';
    exception when insufficient_privilege then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não dá desconto fora do recebimento';
    end;

    v_total := v_total + 1;
    begin
        update public.payments
           set status = 'pago', method = 'pix', paid_at = current_date, discount = 20
         where id = v_pay;
        get diagnostics v_n = row_count;
        if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária recebe com desconto no ato';
        else v_rel := v_rel || E'\n[FALHOU] secretária recebe — nenhuma linha atualizada'; end if;
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] secretária recebe — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    begin
        update public.payments set status = 'pendente', paid_at = null, method = null where id = v_pay;
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária desfaz o recebimento';
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] secretária desfaz recebimento — ' || sqlerrm;
    end;

    v_total := v_total + 1;
    select count(*) into v_n from public.expenses where clinic_id = v_clinic;
    if v_n = 0 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] secretária não vê despesas';
    else v_rel := v_rel || E'\n[FALHOU] secretária vê ' || v_n || ' despesa(s)'; end if;

    -- ------------------------------------------------ Dono A
    reset role; set local role authenticated;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

    v_total := v_total + 1;
    select public.payment_patient_name(p) into v_txt from public.payments p where p.id = v_pay;
    if v_txt = 'Paciente do B' then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono vê o nome do paciente de B no Financeiro';
    else v_rel := v_rel || E'\n[FALHOU] dono vê nome = ' || coalesce(v_txt, 'NULL'); end if;

    v_total := v_total + 1;
    select count(*) into v_n from public.expenses where clinic_id = v_clinic;
    if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono vê as despesas';
    else v_rel := v_rel || E'\n[FALHOU] dono vê ' || v_n || ' despesa(s) (esperado 1)'; end if;

    v_total := v_total + 1;
    begin
        update public.payments set amount = 250 where id = v_pay;
        get diagnostics v_n = row_count;
        if v_n = 1 then v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] dono edita o valor da cobrança';
        else v_rel := v_rel || E'\n[FALHOU] dono edita valor — nenhuma linha atualizada'; end if;
    exception when others then
        v_rel := v_rel || E'\n[FALHOU] dono edita valor — ' || sqlerrm;
    end;

    reset role;
    raise exception 'RELATÓRIO 0030 — %/% ok (erro proposital; nada foi gravado)%', v_ok, v_total, v_rel;
end $$;
