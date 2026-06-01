-- Migration 0015: Patient Exams RLS and Storage Policies Corrections

-- ==========================================
-- 1. CORREÇÃO DAS POLÍTICAS DE PATIENT_EXAMS
-- ==========================================

-- Remover a política restritiva anterior se existir
DROP POLICY IF EXISTS "Profissionais gerenciam exames dos seus pacientes" ON public.patient_exams;
DROP POLICY IF EXISTS "Equipe gerencia exames dos pacientes" ON public.patient_exams;
DROP POLICY IF EXISTS "Superadmins gerenciam todos os exames" ON public.patient_exams;
DROP POLICY IF EXISTS "Pacientes veem seus próprios exames" ON public.patient_exams;

-- Habilitar RLS na tabela patient_exams (caso não esteja ativado)
ALTER TABLE public.patient_exams ENABLE ROW LEVEL SECURITY;

-- Nova política: Membros da equipe gerenciam os exames dos pacientes da sua própria clínica
CREATE POLICY "Equipe gerencia exames dos pacientes" 
    ON public.patient_exams 
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            JOIN public.clinic_members cm ON cm.clinic_id = p.clinic_id
            WHERE p.id = patient_exams.patient_id
              AND cm.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients p
            JOIN public.clinic_members cm ON cm.clinic_id = p.clinic_id
            WHERE p.id = patient_exams.patient_id
              AND cm.user_id = auth.uid()
        )
    );

-- Nova política: Superadmins têm controle total sobre todos os exames de todas as clínicas
CREATE POLICY "Superadmins gerenciam todos os exames" 
    ON public.patient_exams 
    FOR ALL 
    TO authenticated
    USING (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    )
    WITH CHECK (
        (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
    );

-- Nova política: Pacientes podem ver seus próprios registros de exames
CREATE POLICY "Pacientes veem seus próprios exames" 
    ON public.patient_exams 
    FOR SELECT 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = patient_exams.patient_id
              AND p.user_id = auth.uid()
        )
    );


-- ==========================================
-- 2. CORREÇÃO DAS POLÍTICAS DO STORAGE BUCKET
-- ==========================================

-- Remover as políticas de armazenamento anteriores que continham o bug da coluna incorreta p.name
DROP POLICY IF EXISTS "Membros da clinica podem ver exames" ON storage.objects;
DROP POLICY IF EXISTS "Membros da clinica podem enviar exames" ON storage.objects;
DROP POLICY IF EXISTS "Membros da clinica podem deletar exames" ON storage.objects;
DROP POLICY IF EXISTS "Superadmins podem gerenciar todos os exames no storage" ON storage.objects;
DROP POLICY IF EXISTS "Pacientes podem ver seus exames no storage" ON storage.objects;

-- Nova política de Storage: Membros da clínica podem ler exames de seus próprios pacientes
CREATE POLICY "Membros da clinica podem ver exames" 
    ON storage.objects 
    FOR SELECT 
    TO authenticated
    USING (
        bucket_id = 'exams-bucket' AND (
            EXISTS (
                SELECT 1 FROM public.patients p
                JOIN public.clinic_members cm ON cm.clinic_id = p.clinic_id
                WHERE p.id::text = split_part(objects.name, '/', 1)
                  AND cm.user_id = auth.uid()
            )
        )
    );

-- Nova política de Storage: Membros da clínica podem fazer upload de exames para seus próprios pacientes
CREATE POLICY "Membros da clinica podem enviar exames" 
    ON storage.objects 
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        bucket_id = 'exams-bucket' AND (
            EXISTS (
                SELECT 1 FROM public.patients p
                JOIN public.clinic_members cm ON cm.clinic_id = p.clinic_id
                WHERE p.id::text = split_part(objects.name, '/', 1)
                  AND cm.user_id = auth.uid()
            )
        )
    );

-- Nova política de Storage: Membros da clínica podem remover exames de seus próprios pacientes
CREATE POLICY "Membros da clinica podem deletar exames" 
    ON storage.objects 
    FOR DELETE 
    TO authenticated
    USING (
        bucket_id = 'exams-bucket' AND (
            EXISTS (
                SELECT 1 FROM public.patients p
                JOIN public.clinic_members cm ON cm.clinic_id = p.clinic_id
                WHERE p.id::text = split_part(objects.name, '/', 1)
                  AND cm.user_id = auth.uid()
            )
        )
    );

-- Nova política de Storage: Superadmins têm controle total de exames no bucket
CREATE POLICY "Superadmins podem gerenciar todos os exames no storage" 
    ON storage.objects 
    FOR ALL 
    TO authenticated
    USING (
        bucket_id = 'exams-bucket' AND (
            (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
        )
    )
    WITH CHECK (
        bucket_id = 'exams-bucket' AND (
            (SELECT is_superadmin FROM public.profiles WHERE id = auth.uid()) = true
        )
    );

-- Nova política de Storage: Pacientes podem visualizar seus próprios exames anexados
CREATE POLICY "Pacientes podem ver seus exames no storage" 
    ON storage.objects 
    FOR SELECT 
    TO authenticated
    USING (
        bucket_id = 'exams-bucket' AND (
            EXISTS (
                SELECT 1 FROM public.patients p
                WHERE p.id::text = split_part(objects.name, '/', 1)
                  AND p.user_id = auth.uid()
            )
        )
    );
