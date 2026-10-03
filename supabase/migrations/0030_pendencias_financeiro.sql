-- ============================================================================
-- Migration 0030 — Pendências da auditoria de isolamento (2026-10-03)
-- ============================================================================
--
-- 1. Secretária "só recebe" (decisão do módulo Financeiro, 2026-09-30): pode
--    registrar/desfazer recebimento (forma, data, observação e o desconto NO
--    ATO do recebimento), cancelar/reabrir e lançar cobrança — mas não edita
--    valor, descrição, vencimento, paciente ou profissional de uma cobrança.
-- 2. Despesas voltam a ser dono + nutricionista (a 0029 tinha trocado, por
--    engano, para dono + secretária — contrariando a mesma decisão).
-- 3. Nome do paciente no Financeiro: o dono vê os recebimentos da clínica
--    toda, mas o RLS de `patients` (0029) esconde o paciente de outro
--    nutricionista. Campo calculado devolve SÓ o nome, e só para quem já vê
--    aquele recebimento.
-- 4. Registra 0028, 0029 e 0030 no histórico de migrations do Supabase
--    (foram aplicadas pelo SQL Editor, que não registra).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Secretária: colunas que ela não altera em `payments`
-- ----------------------------------------------------------------------------
create or replace function public.enforce_secretary_payment_columns()
returns trigger language plpgsql set search_path = public
as $$
begin
    -- Só chamadas diretas do app. Triggers SECURITY DEFINER (ex.:
    -- sync_appointment_payment ao reagendar) rodam como postgres e passam.
    if current_user not in ('authenticated', 'anon') then
        return new;
    end if;
    -- Dono/nutricionista da clínica editam livremente (o RLS já recorta).
    if public.acting_member_of(old.clinic_id, array['owner', 'nutritionist']) then
        return new;
    end if;

    if new.amount          is distinct from old.amount
       or new.description  is distinct from old.description
       or new.due_date     is distinct from old.due_date
       or new.patient_id   is distinct from old.patient_id
       or new.service_id   is distinct from old.service_id
       or new.nutritionist_id is distinct from old.nutritionist_id
       or new.appointment_id  is distinct from old.appointment_id
       or new.clinic_id    is distinct from old.clinic_id
       or new.created_by   is distinct from old.created_by then
        raise exception 'A secretária registra recebimentos, mas não altera valor, descrição ou vencimento da cobrança.'
            using errcode = '42501';
    end if;

    -- Desconto só no ato de receber (pendente → pago).
    if new.discount is distinct from old.discount
       and not (old.status <> 'pago' and new.status = 'pago') then
        raise exception 'O desconto só pode ser dado no momento do recebimento.'
            using errcode = '42501';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_secretary_payment_columns on public.payments;
create trigger trg_enforce_secretary_payment_columns
    before update on public.payments
    for each row execute function public.enforce_secretary_payment_columns();

-- ----------------------------------------------------------------------------
-- 2. Despesas: dono + nutricionista (decisão original do Financeiro)
-- ----------------------------------------------------------------------------
drop policy if exists expenses_admin_all    on public.expenses;
drop policy if exists expenses_clinical_all on public.expenses;
create policy expenses_clinical_all on public.expenses for all to authenticated
    using (public.acting_member_of(clinic_id, array['owner', 'nutritionist']))
    with check (public.acting_member_of(clinic_id, array['owner', 'nutritionist']));

-- ----------------------------------------------------------------------------
-- 3. Campo calculado: nome do paciente de um recebimento
--    `select('*, payment_patient_name')`. Revalida a visibilidade do
--    recebimento (mesma regra de payments_team_select) e confere que a linha
--    recebida existe de fato — chamada direta via RPC com linha forjada não
--    revela nada.
-- ----------------------------------------------------------------------------
create or replace function public.payment_patient_name(p public.payments)
returns text language sql stable security definer set search_path = public
as $$
    select pt.name
    from public.payments pay
    join public.patients pt on pt.id = pay.patient_id
    where pay.id = p.id
      and pay.patient_id = p.patient_id
      and pay.clinic_id = p.clinic_id
      and (
          public.acting_member_of(pay.clinic_id, array['owner', 'secretary'])
          or (public.acting_member_of(pay.clinic_id)
              and (pay.nutritionist_id = auth.uid() or public.can_access_patient(pay.patient_id)))
      );
$$;

revoke execute on function public.payment_patient_name(public.payments) from public, anon;
grant execute on function public.payment_patient_name(public.payments) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Histórico de migrations (aplicadas pelo SQL Editor, fora do CLI/MCP)
-- ----------------------------------------------------------------------------
insert into supabase_migrations.schema_migrations (version, name)
select v, n from (values
    ('20261003120000', '0028_seguranca_urgente'),
    ('20261003170000', '0029_isolamento_por_nutricionista'),
    ('20261003200000', '0030_pendencias_financeiro')
) as m(v, n)
where not exists (select 1 from supabase_migrations.schema_migrations s where s.name = m.n);

commit;
