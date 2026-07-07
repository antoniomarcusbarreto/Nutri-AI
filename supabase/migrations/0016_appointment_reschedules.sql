-- Migration 0016: Appointment Reschedules Audit Table

-- Criar a tabela de histórico de reagendamentos
CREATE TABLE IF NOT EXISTS public.appointment_reschedules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE NOT NULL,
    rescheduled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    reason text NOT NULL,
    old_date_time timestamp with time zone NOT NULL,
    new_date_time timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.appointment_reschedules ENABLE ROW LEVEL SECURITY;

-- Remover políticas se já existirem
DROP POLICY IF EXISTS "Equipe gerencia reagendamentos" ON public.appointment_reschedules;

-- Criar política RLS permitindo que membros da clínica gerenciem (ler e inserir) reagendamentos
CREATE POLICY "Equipe gerencia reagendamentos" 
    ON public.appointment_reschedules 
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.clinic_members cm ON cm.clinic_id = a.clinic_id
            WHERE a.id = appointment_reschedules.appointment_id
              AND cm.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.appointments a
            JOIN public.clinic_members cm ON cm.clinic_id = a.clinic_id
            WHERE a.id = appointment_reschedules.appointment_id
              AND cm.user_id = auth.uid()
        )
    );
