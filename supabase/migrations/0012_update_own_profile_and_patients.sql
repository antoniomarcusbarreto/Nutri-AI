-- Migration 0012: Update own profile and patients account

-- 1. Create update_own_profile function to allow the logged in user to update their own profile and email
CREATE OR REPLACE FUNCTION public.update_own_profile(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_crn TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update email in auth.users for the logged-in user
    UPDATE auth.users
    SET email = p_email,
        email_change = ''
    WHERE id = auth.uid();

    -- Update profile details
    UPDATE public.profiles
    SET full_name = p_name, 
        phone = p_phone, 
        crn = p_crn
    WHERE id = auth.uid();
END;
$$;

-- 2. Create update_patient_account function to allow owners/nutritionists to update patients and their emails
CREATE OR REPLACE FUNCTION public.update_patient_account(
    p_clinic_id UUID,
    p_patient_id UUID,
    p_name TEXT,
    p_cpf TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_status TEXT,
    p_birth_date DATE,
    p_biological_sex TEXT,
    p_main_goal TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_user_id UUID;
BEGIN
    -- Check permissions (Only owner or nutritionist of the clinic can modify patients)
    SELECT cm.role INTO v_caller_role 
    FROM public.clinic_members cm
    WHERE cm.clinic_id = p_clinic_id AND cm.user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role NOT IN ('owner', 'nutritionist') THEN
        RAISE EXCEPTION 'Acesso negado. Apenas nutricionistas ou proprietários podem alterar pacientes.';
    END IF;

    -- Find user_id associated with this patient
    SELECT user_id INTO v_user_id 
    FROM public.patients 
    WHERE id = p_patient_id AND clinic_id = p_clinic_id;

    -- Update patients table details
    UPDATE public.patients 
    SET name = p_name,
        cpf = p_cpf,
        email = p_email,
        phone = p_phone,
        status = p_status,
        birth_date = p_birth_date,
        biological_sex = p_biological_sex,
        main_goal = p_main_goal
    WHERE id = p_patient_id AND clinic_id = p_clinic_id;

    -- If patient has a linked auth user account, update that too
    IF v_user_id IS NOT NULL THEN
        -- Update email in auth.users
        UPDATE auth.users
        SET email = p_email,
            email_change = ''
        WHERE id = v_user_id;

        -- Update profiles full_name and phone
        UPDATE public.profiles
        SET full_name = p_name,
            phone = p_phone
        WHERE id = v_user_id;
    END IF;
END;
$$;
