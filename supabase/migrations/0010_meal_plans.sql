-- Migration 0010: Create meal_plans table

CREATE TABLE IF NOT EXISTS public.meal_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    nutritionist_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    kcal INTEGER,
    meals JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

-- Create Policy
DROP POLICY IF EXISTS "Equipe gerencia meal_plans" ON public.meal_plans;
CREATE POLICY "Equipe gerencia meal_plans" ON public.meal_plans
    FOR ALL USING (
        exists (
            SELECT 1 FROM public.clinic_members 
            WHERE clinic_id = meal_plans.clinic_id AND user_id = auth.uid()
        )
    );
