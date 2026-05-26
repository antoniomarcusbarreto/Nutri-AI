-- Migration 0009: Staff management functions (SECURITY DEFINER)

-- 1. Function to create a staff member (nutritionist or secretary)
CREATE OR REPLACE FUNCTION public.create_staff_member(
    p_clinic_id UUID,
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_crn TEXT,
    p_role TEXT,
    p_password TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_caller_role TEXT;
BEGIN
    -- Check permissions (Only owner of the clinic can manage staff members)
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role != 'owner' AND v_caller_role != 'nutritionist' THEN
        -- Allow nutritionist too if needed, but standard is owner. Let's make it 'owner' for safety, or 'owner' + 'nutritionist'
        -- The user said: "Esse cadastro é para os funcionários da clinica..."
        -- Let's restrict to owner and nutritionist to be safe and flexible
        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Acesso negado. Você não é membro desta clínica.';
        ELSE
            RAISE EXCEPTION 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
        END IF;
    END IF;

    -- Validate role
    IF p_role NOT IN ('nutritionist', 'secretary') THEN
        RAISE EXCEPTION 'Papel inválido. Deve ser nutritionist ou secretary.';
    END IF;

    -- Search for existing user in auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

    IF v_user_id IS NULL THEN
        -- Create user in auth.users
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
    END IF;

    -- Create or update profile
    INSERT INTO public.profiles (id, full_name, phone, crn, is_active)
    VALUES (v_user_id, p_name, p_phone, p_crn, true)
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name, 
        phone = EXCLUDED.phone,
        crn = EXCLUDED.crn;

    -- Create clinic member entry
    INSERT INTO public.clinic_members (clinic_id, user_id, role)
    VALUES (p_clinic_id, v_user_id, p_role)
    ON CONFLICT (clinic_id, user_id) DO UPDATE SET
        role = EXCLUDED.role;

    RETURN v_user_id;
END;
$$;

-- 2. Function to update a staff member
CREATE OR REPLACE FUNCTION public.update_staff_member(
    p_clinic_id UUID,
    p_user_id UUID,
    p_name TEXT,
    p_phone TEXT,
    p_crn TEXT,
    p_role TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check permissions
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role != 'owner' AND v_caller_role != 'nutritionist' THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
    END IF;

    -- Update profile
    UPDATE public.profiles
    SET full_name = p_name, phone = p_phone, crn = p_crn
    WHERE id = p_user_id;

    -- Update clinic member role
    UPDATE public.clinic_members
    SET role = p_role
    WHERE clinic_id = p_clinic_id AND user_id = p_user_id;
END;
$$;

-- 3. Function to toggle staff member status
CREATE OR REPLACE FUNCTION public.toggle_staff_member_status(
    p_clinic_id UUID,
    p_user_id UUID,
    p_is_active BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check permissions
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role != 'owner' AND v_caller_role != 'nutritionist' THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
    END IF;

    -- Can't deactivate yourself
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Você não pode desativar seu próprio acesso.';
    END IF;

    UPDATE public.profiles
    SET is_active = p_is_active
    WHERE id = p_user_id;
END;
$$;

-- 4. Function to delete a staff member
CREATE OR REPLACE FUNCTION public.delete_staff_member(
    p_clinic_id UUID,
    p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check permissions
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role != 'owner' AND v_caller_role != 'nutritionist' THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
    END IF;

    -- Can't delete yourself
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Você não pode remover a si mesmo da clínica.';
    END IF;

    -- Delete clinic member entry
    DELETE FROM public.clinic_members
    WHERE clinic_id = p_clinic_id AND user_id = p_user_id;

    -- If this user has no other clinic memberships, clean up profile and auth.users
    IF NOT EXISTS (SELECT 1 FROM public.clinic_members WHERE user_id = p_user_id) THEN
        DELETE FROM public.profiles WHERE id = p_user_id;
        DELETE FROM auth.users WHERE id = p_user_id;
    END IF;
END;
$$;
