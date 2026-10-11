-- ============================================================================
-- Verificação da migration 0040 (confirmar/desmarcar só até o horário).
-- Bloco único e autocontido; termina com ERRO PROPOSITAL cuja mensagem é o
-- relatório — tudo é desfeito. Esperado: "RELATÓRIO 0040 — 4/4 ok".
-- ============================================================================
do $$
declare
    v_clinic uuid := gen_random_uuid();
    v_a  uuid := gen_random_uuid();
    v_p  uuid := gen_random_uuid();
    v_past   uuid := gen_random_uuid();
    v_future uuid := gen_random_uuid();
    v_tok_past uuid;
    v_tok_future uuid;
    v_j jsonb;
    v_total int := 0; v_ok int := 0; v_rel text := '';
begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_a, 'authenticated', 'authenticated',
            'c0040-' || v_a || '@exemplo.com', '', now(), '{}', '{}', now(), now(), '', '', '', '');
    insert into public.profiles (id, full_name, is_active) values (v_a, 'Nutri A', true);
    insert into public.clinics (id, name, owner_id, plan_level) values (v_clinic, 'Clínica 0040', v_a, 'starter');
    insert into public.clinic_members (clinic_id, user_id, role) values (v_clinic, v_a, 'owner');
    insert into public.patients (id, clinic_id, nutritionist_id, name, phone, status) values
        (v_p, v_clinic, v_a, 'Maria', '(79) 99912-2107', 'ativo');
    insert into public.appointments (id, clinic_id, patient_id, nutritionist_id, date_time, status) values
        (v_past,   v_clinic, v_p, v_a, now() - interval '3 hours', 'pendente'),
        (v_future, v_clinic, v_p, v_a, now() + interval '3 hours', 'pendente');
    select public_token into v_tok_past   from public.appointments where id = v_past;
    select public_token into v_tok_future from public.appointments where id = v_future;

    -- 1. consulta que já passou: não confirma (link ainda abre)
    v_total := v_total + 1;
    if not public.confirm_appointment_public(v_tok_past, 'confirmado')
       and (select status from public.appointments where id = v_past) = 'pendente'
       and exists (select 1 from public.get_appointment_details_public(v_tok_past)) then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] passou do horário: não confirma, mas o link abre';
    else v_rel := v_rel || E'\n[FALHOU] confirmou consulta passada'; end if;

    -- 2. nem desmarca
    v_total := v_total + 1;
    if not public.confirm_appointment_public(v_tok_past, 'cancelado') then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] passou do horário: não desmarca';
    else v_rel := v_rel || E'\n[FALHOU] desmarcou consulta passada'; end if;

    -- 3. consulta futura continua confirmando
    v_total := v_total + 1;
    if public.confirm_appointment_public(v_tok_future, 'confirmado')
       and (select status from public.appointments where id = v_future) = 'confirmado' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] consulta futura confirma';
    else v_rel := v_rel || E'\n[FALHOU] consulta futura não confirmou'; end if;

    -- 4. botão do WhatsApp numa consulta passada => expired
    v_total := v_total + 1;
    v_j := public.whatsapp_register_reply('999@lid', null, 'confirmar:' || v_tok_past);
    if v_j->>'result' = 'expired' then
        v_ok := v_ok + 1; v_rel := v_rel || E'\n[ok] WhatsApp: consulta passada => expired';
    else v_rel := v_rel || E'\n[FALHOU] WhatsApp: ' || v_j::text; end if;

    raise exception 'RELATÓRIO 0040 — %/% ok%', v_ok, v_total, v_rel;
end;
$$;
