-- ============================================================================
-- Migration 0024 — Onda 2 (fecho): integridade patient_id ↔ clinic_id no RLS
-- ============================================================================
--
-- Brecha #1 do laudo de RLS (integridade, não confidencialidade):
--
--   As policies de `consultations`, `meal_plans` e `appointments` validavam
--   apenas `acting_member_of(clinic_id)` no WITH CHECK. Um membro da Clínica A
--   podia INSERIR uma linha com `clinic_id = A` (o dele) mas
--   `patient_id = <paciente da Clínica B>`, contanto que conhecesse o UUID —
--   criando uma linha órfã / inconsistente. Não vaza dados (a Clínica B não vê
--   a linha, cujo clinic_id é A; a Clínica A não passa a ver o paciente de B),
--   mas polui a base.
--
--   `patient_exams` NÃO tinha essa brecha — a policy já resolve a clínica pelo
--   join `patients p WHERE p.id = patient_id`.
--
-- Correção: helper SECURITY DEFINER `patient_in_clinic(patient_id, clinic_id)`
-- e adição de `AND public.patient_in_clinic(patient_id, clinic_id)` ao USING e
-- ao WITH CHECK das 3 policies. Mantém toda a semântica anterior de clínica +
-- papel + conta ativa; só recusa a combinação inconsistente.
--
-- Nota: a rotação/expiração do `patients.form_token` (brecha #2) fica no
-- backlog de segurança, conforme decidido.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Helper — o paciente pertence à clínica informada?
--    SECURITY DEFINER: não dispara a RLS de `patients` dentro da avaliação da
--    policy (mesmo padrão de is_account_active / acting_member_of / get_my_clinics).
-- ----------------------------------------------------------------------------
create or replace function public.patient_in_clinic(p_patient_id uuid, p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from public.patients
        where id = p_patient_id
          and clinic_id = p_clinic_id
    );
$$;

revoke execute on function public.patient_in_clinic(uuid, uuid) from anon;

-- ----------------------------------------------------------------------------
-- 2. consultations  (prontuário — owner/nutritionist + conta ativa + paciente da clínica)
-- ----------------------------------------------------------------------------
drop policy if exists "consultations_clinical_all" on public.consultations;
create policy "consultations_clinical_all"
    on public.consultations for all to authenticated
    using (
        public.acting_member_of(clinic_id, array['owner','nutritionist'])
        and public.patient_in_clinic(patient_id, clinic_id)
    )
    with check (
        public.acting_member_of(clinic_id, array['owner','nutritionist'])
        and public.patient_in_clinic(patient_id, clinic_id)
    );

-- ----------------------------------------------------------------------------
-- 3. meal_plans  (qualquer membro da clínica + conta ativa + paciente da clínica)
-- ----------------------------------------------------------------------------
drop policy if exists "meal_plans_team_all" on public.meal_plans;
create policy "meal_plans_team_all"
    on public.meal_plans for all to authenticated
    using (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    )
    with check (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    );

-- ----------------------------------------------------------------------------
-- 4. appointments  (qualquer membro da clínica + conta ativa + paciente da clínica)
-- ----------------------------------------------------------------------------
drop policy if exists "appointments_team_all" on public.appointments;
create policy "appointments_team_all"
    on public.appointments for all to authenticated
    using (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    )
    with check (
        public.acting_member_of(clinic_id)
        and public.patient_in_clinic(patient_id, clinic_id)
    );

commit;

-- ============================================================================
-- Verificação (preview branch, contas de teste nutriA@ / nutriB@):
--   1. nutriA insere consultation/meal_plan/appointment com patient_id de A  → OK
--   2. nutriA insere qualquer das 3 com patient_id de B (UUID conhecido)     → erro (WITH CHECK)
--   3. Leitura das 3 tabelas como nutriA continua devolvendo só linhas de A
--   4. Fluxo normal de Agenda / Consultas / Planos do app: sem regressão
--
-- Rollback:
--   drop policy ... ; recriar as 3 policies da migration 0019 (sem patient_in_clinic);
--   drop function if exists public.patient_in_clinic(uuid, uuid);
-- ============================================================================
