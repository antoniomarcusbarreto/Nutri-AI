-- Migration 0014: Superadmin Patients RLS Policy

-- 1. Create policy for superadmins to manage all patients
DROP POLICY IF EXISTS "Superadmins gerenciam todos os pacientes" ON public.patients;

CREATE POLICY "Superadmins gerenciam todos os pacientes" 
    ON public.patients FOR ALL USING (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    );
