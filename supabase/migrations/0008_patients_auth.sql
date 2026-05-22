-- 1. Adicionar user_id na tabela patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Criar extensão pgcrypto se não existir para o hash da senha
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Função segura (RPC) para criar conta do paciente
CREATE OR REPLACE FUNCTION create_patient_account(
    p_clinic_id UUID,
    p_name TEXT,
    p_cpf TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_status TEXT,
    p_password TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_existing_patient_id UUID;
    v_caller_role TEXT;
BEGIN
    -- Verifica permissão (Apenas Owner ou Nutritionist da clínica podem cadastrar)
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role NOT IN ('owner', 'nutritionist') THEN
        RAISE EXCEPTION 'Acesso negado. Apenas nutricionistas podem cadastrar pacientes.';
    END IF;

    -- Tenta encontrar o usuário pelo email na tabela auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

    -- Se não encontrou, cria na auth.users
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', 
            p_email, crypt(p_password, gen_salt('bf')), 
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', ''
        );
        
        -- Cria o profile correspondente
        INSERT INTO public.profiles (id, full_name, phone)
        VALUES (v_user_id, p_name, p_phone)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;
    END IF;

    -- Regra de Negócio: Inativar o paciente em OUTRAS clínicas (preservando o histórico, mas bloqueando acesso ativo lá)
    UPDATE public.patients 
    SET status = 'inativo' 
    WHERE user_id = v_user_id AND clinic_id != p_clinic_id;

    -- Verifica se já existe um registro do paciente NESTA clínica
    SELECT id INTO v_existing_patient_id 
    FROM public.patients 
    WHERE clinic_id = p_clinic_id AND user_id = v_user_id 
    LIMIT 1;

    IF v_existing_patient_id IS NOT NULL THEN
        -- Atualiza o registro existente
        UPDATE public.patients 
        SET name = p_name, cpf = p_cpf, phone = p_phone, status = p_status
        WHERE id = v_existing_patient_id;
    ELSE
        -- Cria o registro do paciente na clínica
        INSERT INTO public.patients (clinic_id, user_id, name, cpf, email, phone, status)
        VALUES (p_clinic_id, v_user_id, p_name, p_cpf, p_email, p_phone, p_status);
    END IF;

    RETURN v_user_id;
END;
$$;

-- 3. Atualizar Políticas (RLS) da tabela patients para que o Paciente veja seus próprios dados
DROP POLICY IF EXISTS "Pacientes veem seus próprios registros" ON public.patients;
CREATE POLICY "Pacientes veem seus próprios registros" 
    ON public.patients FOR SELECT 
    USING (user_id = auth.uid());

-- Permitir que o paciente veja seus profiles
DROP POLICY IF EXISTS "Usuários leem seus profiles e equipe leem" ON public.profiles;
CREATE POLICY "Usuários leem seus profiles e equipe leem" 
    ON public.profiles FOR SELECT 
    USING (id = auth.uid() OR exists (
        select 1 from public.clinic_members cm1 
        join public.clinic_members cm2 on cm1.clinic_id = cm2.clinic_id
        where cm1.user_id = auth.uid() and cm2.user_id = profiles.id
    ));
