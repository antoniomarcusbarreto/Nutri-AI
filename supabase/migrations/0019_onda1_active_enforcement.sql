-- ============================================================================
-- Migration 0019 — Onda 1: Enforcement de `is_active` no RLS (SEC-05)
-- ============================================================================
--
-- SEC-05 (ALTA): a desativação de uma conta (profiles.is_active = false) só era
-- checada no cliente (AuthContext: signOut se is_active === false). Nenhuma
-- policy de RLS considerava is_active, então um usuário "desativado" — staff ou
-- paciente — mantinha JWT + refresh token válidos e ACESSO PLENO ao banco até o
-- token expirar. O bloqueio de acesso de staff/paciente era cosmético.
--
-- Correção: um helper SECURITY DEFINER `is_account_active(uid)` e dois helpers
-- de conveniência `acting_member_of(clinic[, roles])` que combinam
-- "é membro da clínica" + "conta ativa". Todas as policies de dados passam a
-- exigir conta ativa. Bônus: centraliza o padrão
-- `EXISTS (SELECT 1 FROM clinic_members ...)` repetido em ~20 policies e evita
-- avaliação aninhada de RLS (o helper é SECURITY DEFINER).
--
-- De-recursão adicional: as policies "Superadmins gerenciam todos os pacientes"
-- (0014) e "Superadmins gerenciam todos os exames" (0015) ainda faziam
-- SELECT ... FROM profiles inline; passam a usar is_superadmin() (SEC-12).
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Helpers
-- ----------------------------------------------------------------------------
create or replace function public.is_account_active(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select coalesce(
        (select is_active from public.profiles where id = p_user_id),
        false
    );
$$;

create or replace function public.acting_member_of(p_clinic_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select public.is_account_active(auth.uid())
       and exists (
           select 1 from public.clinic_members cm
           where cm.clinic_id = p_clinic_id
             and cm.user_id = auth.uid()
       );
$$;

create or replace function public.acting_member_of(p_clinic_id uuid, p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select public.is_account_active(auth.uid())
       and exists (
           select 1 from public.clinic_members cm
           where cm.clinic_id = p_clinic_id
             and cm.user_id = auth.uid()
             and cm.role = any(p_roles)
       );
$$;

revoke execute on function public.is_account_active(uuid)          from anon;
revoke execute on function public.acting_member_of(uuid)           from anon;
revoke execute on function public.acting_member_of(uuid, text[])   from anon;

-- ----------------------------------------------------------------------------
-- 2. patients
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe gerencia pacientes"                 on public.patients;
drop policy if exists "Pacientes veem seus próprios registros"     on public.patients;
drop policy if exists "Superadmins gerenciam todos os pacientes"   on public.patients;

create policy "patients_team_all"
    on public.patients for all to authenticated
    using      (public.acting_member_of(clinic_id))
    with check (public.acting_member_of(clinic_id));

create policy "patients_self_select"
    on public.patients for select to authenticated
    using (user_id = auth.uid() and public.is_account_active(auth.uid()));

create policy "patients_superadmin_all"
    on public.patients for all to authenticated
    using      (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. appointments
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe gerencia agendamentos" on public.appointments;
create policy "appointments_team_all"
    on public.appointments for all to authenticated
    using      (public.acting_member_of(clinic_id))
    with check (public.acting_member_of(clinic_id));

-- ----------------------------------------------------------------------------
-- 4. consultations (prontuário — só owner/nutritionist)
-- ----------------------------------------------------------------------------
drop policy if exists "Somente Nutri e Owner acessam prontuários" on public.consultations;
create policy "consultations_clinical_all"
    on public.consultations for all to authenticated
    using      (public.acting_member_of(clinic_id, array['owner','nutritionist']))
    with check (public.acting_member_of(clinic_id, array['owner','nutritionist']));

-- ----------------------------------------------------------------------------
-- 5. services
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe visualiza serviços"                on public.services;
drop policy if exists "Apenas Nutri e Owner gerenciam serviços"  on public.services;
drop policy if exists "Apenas Nutri e Owner atualizam serviços"  on public.services;
drop policy if exists "Apenas Nutri e Owner deletam serviços"    on public.services;

create policy "services_team_select"
    on public.services for select to authenticated
    using (public.acting_member_of(clinic_id));

create policy "services_clinical_insert"
    on public.services for insert to authenticated
    with check (public.acting_member_of(clinic_id, array['owner','nutritionist']));

create policy "services_clinical_update"
    on public.services for update to authenticated
    using      (public.acting_member_of(clinic_id, array['owner','nutritionist']))
    with check (public.acting_member_of(clinic_id, array['owner','nutritionist']));

create policy "services_clinical_delete"
    on public.services for delete to authenticated
    using (public.acting_member_of(clinic_id, array['owner','nutritionist']));

-- ----------------------------------------------------------------------------
-- 6. meal_plans  (restrição de papel da secretária = SEC-13 / Onda 2)
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe gerencia meal_plans" on public.meal_plans;
create policy "meal_plans_team_all"
    on public.meal_plans for all to authenticated
    using      (public.acting_member_of(clinic_id))
    with check (public.acting_member_of(clinic_id));

-- ----------------------------------------------------------------------------
-- 7. patient_exams
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe gerencia exames dos pacientes"   on public.patient_exams;
drop policy if exists "Pacientes veem seus próprios exames"     on public.patient_exams;
drop policy if exists "Superadmins gerenciam todos os exames"   on public.patient_exams;

create policy "patient_exams_team_all"
    on public.patient_exams for all to authenticated
    using (
        exists (
            select 1 from public.patients p
            where p.id = patient_exams.patient_id
              and public.acting_member_of(p.clinic_id)
        )
    )
    with check (
        exists (
            select 1 from public.patients p
            where p.id = patient_exams.patient_id
              and public.acting_member_of(p.clinic_id)
        )
    );

create policy "patient_exams_self_select"
    on public.patient_exams for select to authenticated
    using (
        public.is_account_active(auth.uid())
        and exists (
            select 1 from public.patients p
            where p.id = patient_exams.patient_id
              and p.user_id = auth.uid()
        )
    );

create policy "patient_exams_superadmin_all"
    on public.patient_exams for all to authenticated
    using      (public.is_superadmin(auth.uid()))
    with check (public.is_superadmin(auth.uid()));

-- ----------------------------------------------------------------------------
-- 8. appointment_reschedules
-- ----------------------------------------------------------------------------
drop policy if exists "Equipe gerencia reagendamentos" on public.appointment_reschedules;
create policy "appointment_reschedules_team_all"
    on public.appointment_reschedules for all to authenticated
    using (
        exists (
            select 1 from public.appointments a
            where a.id = appointment_reschedules.appointment_id
              and public.acting_member_of(a.clinic_id)
        )
    )
    with check (
        exists (
            select 1 from public.appointments a
            where a.id = appointment_reschedules.appointment_id
              and public.acting_member_of(a.clinic_id)
        )
    );

-- ----------------------------------------------------------------------------
-- 9. reminders
-- ----------------------------------------------------------------------------
drop policy if exists "Users can view reminders of their clinic"   on public.reminders;
drop policy if exists "Users can insert reminders for their clinic" on public.reminders;
drop policy if exists "Users can update their clinic reminders"     on public.reminders;
drop policy if exists "Users can delete their clinic reminders"     on public.reminders;

create policy "reminders_team_select"
    on public.reminders for select to authenticated
    using (public.acting_member_of(clinic_id));

create policy "reminders_team_insert"
    on public.reminders for insert to authenticated
    with check (public.acting_member_of(clinic_id));

create policy "reminders_team_update"
    on public.reminders for update to authenticated
    using      (public.acting_member_of(clinic_id))
    with check (public.acting_member_of(clinic_id));

create policy "reminders_team_delete"
    on public.reminders for delete to authenticated
    using (public.acting_member_of(clinic_id));

-- ----------------------------------------------------------------------------
-- 10. clinic_invites
-- ----------------------------------------------------------------------------
drop policy if exists "Membros veem convites da clínica" on public.clinic_invites;
drop policy if exists "Apenas owner cria convites"        on public.clinic_invites;
drop policy if exists "Apenas owner deleta convites"      on public.clinic_invites;
drop policy if exists "Apenas owner atualiza convites"    on public.clinic_invites;

create policy "clinic_invites_team_select"
    on public.clinic_invites for select to authenticated
    using (public.acting_member_of(clinic_id));

create policy "clinic_invites_owner_insert"
    on public.clinic_invites for insert to authenticated
    with check (public.acting_member_of(clinic_id, array['owner']));

create policy "clinic_invites_owner_update"
    on public.clinic_invites for update to authenticated
    using      (public.acting_member_of(clinic_id, array['owner']))
    with check (public.acting_member_of(clinic_id, array['owner']));

create policy "clinic_invites_owner_delete"
    on public.clinic_invites for delete to authenticated
    using (public.acting_member_of(clinic_id, array['owner']));

-- ----------------------------------------------------------------------------
-- 11. clinics  (owner desativado também perde acesso)
-- ----------------------------------------------------------------------------
drop policy if exists "Usuários veem clínicas onde são owner ou membro" on public.clinics;
drop policy if exists "Usuários criam suas próprias clínicas"           on public.clinics;
drop policy if exists "Owners atualizam suas clínicas"                  on public.clinics;

create policy "clinics_select"
    on public.clinics for select to authenticated
    using (
        public.is_account_active(auth.uid())
        and (owner_id = auth.uid() or id in (select public.get_my_clinics()))
    );

create policy "clinics_insert_own"
    on public.clinics for insert to authenticated
    with check (owner_id = auth.uid() and public.is_account_active(auth.uid()));

create policy "clinics_update_owner"
    on public.clinics for update to authenticated
    using      (owner_id = auth.uid() and public.is_account_active(auth.uid()))
    with check (owner_id = auth.uid() and public.is_account_active(auth.uid()));

-- ----------------------------------------------------------------------------
-- 12. clinic_members
-- ----------------------------------------------------------------------------
drop policy if exists "Membros veem a equipe da clínica" on public.clinic_members;
drop policy if exists "Owners podem adicionar membros"    on public.clinic_members;
drop policy if exists "Owners podem atualizar membros"    on public.clinic_members;
drop policy if exists "Owners podem remover membros"      on public.clinic_members;

create policy "clinic_members_team_select"
    on public.clinic_members for select to authenticated
    using (
        public.is_account_active(auth.uid())
        and clinic_id in (select public.get_my_clinics())
    );

create policy "clinic_members_owner_insert"
    on public.clinic_members for insert to authenticated
    with check (
        public.is_account_active(auth.uid())
        and exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );

create policy "clinic_members_owner_update"
    on public.clinic_members for update to authenticated
    using (
        public.is_account_active(auth.uid())
        and exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );

create policy "clinic_members_owner_delete"
    on public.clinic_members for delete to authenticated
    using (
        public.is_account_active(auth.uid())
        and exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid())
    );

commit;

-- ============================================================================
-- NOTA — bootstrap de signup: um novo owner cria a clínica e se insere em
-- clinic_members no mesmo fluxo; nesse momento profiles.is_active já é true
-- (default da coluna), então clinics_insert_own e clinic_members_owner_insert
-- passam. As policies de superadmin (profiles/clinics/clinic_members) foram
-- redefinidas na 0018 e permanecem válidas.
-- ============================================================================
