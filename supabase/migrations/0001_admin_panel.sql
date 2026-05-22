-- Adiciona a flag de superadmin e status aos perfis
ALTER TABLE public.profiles 
  ADD COLUMN is_superadmin BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN is_active BOOLEAN DEFAULT true NOT NULL;

-- Adiciona campos de assinatura manual em clínicas
-- subscription_status: 'trial', 'active', 'inactive'
ALTER TABLE public.clinics 
  ADD COLUMN subscription_status TEXT DEFAULT 'trial' NOT NULL,
  ADD COLUMN subscription_end_date TIMESTAMP WITH TIME ZONE;

-- Modifica as políticas RLS para permitir acesso amplo aos superadmins
-- 1. Profiles
CREATE POLICY "Superadmins gerenciam todos os perfis" 
    ON public.profiles FOR ALL USING (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    );

-- 2. Clínicas
CREATE POLICY "Superadmins gerenciam todas as clinicas" 
    ON public.clinics FOR ALL USING (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    );

-- 3. Clinic Members
CREATE POLICY "Superadmins veem todos os membros" 
    ON public.clinic_members FOR ALL USING (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    );
