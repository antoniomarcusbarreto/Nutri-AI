-- Adicionar colunas de detalhes na tabela clinics
ALTER TABLE public.clinics
ADD COLUMN address text,
ADD COLUMN neighborhood text,
ADD COLUMN cep text,
ADD COLUMN city text,
ADD COLUMN state text,
ADD COLUMN complement text,
ADD COLUMN operating_hours text,
ADD COLUMN email text,
ADD COLUMN phone text;

-- Criar tabela de convites para membros da clínica
CREATE TABLE public.clinic_invites (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE NOT NULL,
    email text NOT NULL,
    name text,
    role text NOT NULL CHECK (role IN ('nutritionist', 'secretary')),
    status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted', 'cancelled')),
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(clinic_id, email) -- Não permite enviar dois convites para o mesmo email na mesma clínica
);

-- Habilitar RLS
ALTER TABLE public.clinic_invites ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para clinic_invites
-- Membros da clínica podem ver os convites
CREATE POLICY "Membros veem convites da clínica" 
    ON public.clinic_invites FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = clinic_invites.clinic_id AND user_id = auth.uid())
    );

-- Apenas o owner pode criar convites
CREATE POLICY "Apenas owner cria convites" 
    ON public.clinic_invites FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = clinic_invites.clinic_id AND user_id = auth.uid() AND role = 'owner')
    );

-- Apenas o owner pode deletar/cancelar convites
CREATE POLICY "Apenas owner deleta convites" 
    ON public.clinic_invites FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = clinic_invites.clinic_id AND user_id = auth.uid() AND role = 'owner')
    );

-- Atualização de status por anyone (se necessário para aceitar convite, mas via trigger é melhor, ou RLS p/ email)
CREATE POLICY "Apenas owner atualiza convites" 
    ON public.clinic_invites FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.clinic_members WHERE clinic_id = clinic_invites.clinic_id AND user_id = auth.uid() AND role = 'owner')
    );
