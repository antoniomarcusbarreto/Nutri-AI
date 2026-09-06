CREATE OR REPLACE FUNCTION public.get_my_clinics()
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    select clinic_id from public.clinic_members where user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_patient_of_clinic(p_profile_id uuid, p_staff_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.patients p
        JOIN public.clinic_members cm ON p.clinic_id = cm.clinic_id
        WHERE cm.user_id = p_staff_user_id AND p.user_id = p_profile_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_member_of_same_clinic(p_profile_id uuid, p_staff_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.clinic_members cm1
        JOIN public.clinic_members cm2 ON cm1.clinic_id = cm2.clinic_id
        WHERE cm1.user_id = p_staff_user_id AND cm2.user_id = p_profile_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND is_superadmin = true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_own_profile(p_name text, p_email text, p_phone text, p_crn text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_patient_account(p_clinic_id uuid, p_patient_id uuid, p_name text, p_cpf text, p_email text, p_phone text, p_status text, p_birth_date date, p_biological_sex text, p_main_goal text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_patient_clinical_data(p_token uuid, p_allergies text, p_dietary_restrictions text, p_pathologies text, p_medications text, p_physical_activity_level text, p_profession text, p_sleep_quality text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_patient_id UUID;
BEGIN
    SELECT id INTO v_patient_id FROM public.patients WHERE form_token = p_token LIMIT 1;
    IF v_patient_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE public.patients
    SET 
        allergies = p_allergies,
        dietary_restrictions = p_dietary_restrictions,
        pathologies = p_pathologies,
        medications = p_medications,
        physical_activity_level = p_physical_activity_level,
        profession = p_profession,
        sleep_quality = p_sleep_quality
    WHERE id = v_patient_id;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_patient_by_token(p_token uuid)
 RETURNS TABLE(name text, allergies text, dietary_restrictions text, pathologies text, medications text, physical_activity_level text, profession text, sleep_quality text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.name, p.allergies, p.dietary_restrictions, p.pathologies, 
        p.medications, p.physical_activity_level, p.profession, p.sleep_quality
    FROM public.patients p
    WHERE p.form_token = p_token
    LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_patient_account(p_clinic_id uuid, p_name text, p_cpf text, p_email text, p_phone text, p_status text, p_password text, p_birth_date date, p_biological_sex text, p_main_goal text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_existing_patient_id UUID;
    v_caller_role TEXT;
BEGIN
    SELECT role INTO v_caller_role 
    FROM public.clinic_members 
    WHERE clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role NOT IN ('owner', 'nutritionist', 'secretary') THEN
        RAISE EXCEPTION 'Acesso negado. Apenas equipe autorizada pode cadastrar pacientes.';
    END IF;

    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, 
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, email_change, email_change_token_new, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', 
            p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), 
            now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
            '', '', '', ''
        );
        
        INSERT INTO public.profiles (id, full_name, phone)
        VALUES (v_user_id, p_name, p_phone)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone;
    END IF;

    UPDATE public.patients 
    SET status = 'inativo' 
    WHERE user_id = v_user_id AND clinic_id != p_clinic_id;

    SELECT id INTO v_existing_patient_id 
    FROM public.patients 
    WHERE clinic_id = p_clinic_id AND user_id = v_user_id 
    LIMIT 1;

    IF v_existing_patient_id IS NOT NULL THEN
        UPDATE public.patients 
        SET name = p_name, cpf = p_cpf, phone = p_phone, status = p_status,
            birth_date = p_birth_date, biological_sex = p_biological_sex, main_goal = p_main_goal
        WHERE id = v_existing_patient_id;
    ELSE
        INSERT INTO public.patients (clinic_id, user_id, name, cpf, email, phone, status, birth_date, biological_sex, main_goal)
        VALUES (p_clinic_id, v_user_id, p_name, p_cpf, p_email, p_phone, p_status, p_birth_date, p_biological_sex, p_main_goal);
    END IF;

    RETURN v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_patient_password(p_patient_user_id uuid, p_new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_patient_clinic_id UUID;
BEGIN
    -- Pega a clínica do paciente
    SELECT clinic_id INTO v_patient_clinic_id
    FROM public.patients
    WHERE user_id = p_patient_user_id
    LIMIT 1;

    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Paciente não encontrado.';
    END IF;

    -- Verifica se o usuário que está chamando pertence à mesma clínica e é owner ou nutritionist
    IF NOT EXISTS (
        SELECT 1 
        FROM public.clinic_members 
        WHERE clinic_id = v_patient_clinic_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'nutritionist')
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas profissionais da clínica do paciente podem alterar a senha.';
    END IF;

    -- Atualiza a senha na tabela auth.users
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_patient_user_id;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.toggle_patient_status(p_patient_user_id uuid, p_is_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_patient_clinic_id UUID;
BEGIN
    -- Pega a clínica do paciente
    SELECT clinic_id INTO v_patient_clinic_id
    FROM public.patients
    WHERE user_id = p_patient_user_id
    LIMIT 1;

    IF v_patient_clinic_id IS NULL THEN
        RAISE EXCEPTION 'Paciente não encontrado.';
    END IF;

    -- Verifica se o usuário que está chamando pertence à mesma clínica e é owner ou nutritionist
    IF NOT EXISTS (
        SELECT 1 
        FROM public.clinic_members 
        WHERE clinic_id = v_patient_clinic_id 
          AND user_id = auth.uid() 
          AND role IN ('owner', 'nutritionist')
    ) THEN
        RAISE EXCEPTION 'Acesso negado. Apenas profissionais da clínica do paciente podem gerenciar o acesso.';
    END IF;

    -- Atualiza o status de active no profile
    UPDATE public.profiles
    SET is_active = p_is_active
    WHERE id = p_patient_user_id;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_appointment_details_public(p_appointment_id uuid)
 RETURNS TABLE(id uuid, date_time timestamp with time zone, status text, patient_name text, service_name text, professional_name text, clinic_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.date_time,
    a.status,
    p.name AS patient_name,
    s.name AS service_name,
    prof.full_name AS professional_name,
    c.name AS clinic_name
  FROM public.appointments a
  JOIN public.patients p ON a.patient_id = p.id
  JOIN public.profiles prof ON a.nutritionist_id = prof.id
  LEFT JOIN public.services s ON a.service_id = s.id
  JOIN public.clinics c ON a.clinic_id = c.id
  WHERE a.id = p_appointment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_appointment_public(p_appointment_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_status TEXT;
BEGIN
  -- Validar parâmetros de status permitidos
  IF p_status NOT IN ('confirmado', 'cancelado') THEN
    RETURN FALSE;
  END IF;

  -- Obter status atual do agendamento
  SELECT status INTO v_current_status
  FROM public.appointments
  WHERE id = p_appointment_id;

  -- Checar existência do agendamento
  IF v_current_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Bloquear alteração se já estiver confirmado ou cancelado
  IF v_current_status IN ('confirmado', 'cancelado') THEN
    RETURN FALSE;
  END IF;

  -- Atualizar status
  UPDATE public.appointments
  SET status = p_status
  WHERE id = p_appointment_id;

  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_staff_member(p_clinic_id uuid, p_name text, p_email text, p_phone text, p_crn text, p_role text, p_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.toggle_staff_member_status(p_clinic_id uuid, p_user_id uuid, p_is_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.delete_staff_member(p_clinic_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.allocate_user_to_clinic(p_user_id uuid, p_clinic_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_superadmin BOOLEAN;
BEGIN
    -- Check if caller is superadmin
    SELECT is_superadmin INTO v_is_superadmin
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_is_superadmin IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores Master podem alocar usuários.';
    END IF;

    -- Validate role (owner, nutritionist, secretary)
    IF p_role NOT IN ('owner', 'nutritionist', 'secretary') THEN
        RAISE EXCEPTION 'Papel inválido. Deve ser owner, nutritionist ou secretary.';
    END IF;

    -- Delete existing memberships for this user to ensure they are in exactly one clinic
    DELETE FROM public.clinic_members WHERE user_id = p_user_id;

    -- Insert new membership
    INSERT INTO public.clinic_members (clinic_id, user_id, role)
    VALUES (p_clinic_id, p_user_id, p_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_staff_member(p_clinic_id uuid, p_user_id uuid, p_name text, p_email text, p_phone text, p_crn text, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check permissions (Only owner or nutritionist of the clinic can manage staff members)
    SELECT cm.role INTO v_caller_role 
    FROM public.clinic_members cm
    WHERE cm.clinic_id = p_clinic_id AND user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role != 'owner' AND v_caller_role != 'nutritionist' THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores ou proprietários podem gerenciar a equipe.';
    END IF;

    -- Update email in auth.users
    UPDATE auth.users
    SET email = p_email,
        email_change = ''
    WHERE id = p_user_id;

    -- Update profile details
    UPDATE public.profiles
    SET full_name = p_name, 
        phone = p_phone, 
        crn = p_crn
    WHERE id = p_user_id;

    -- Update clinic member role
    UPDATE public.clinic_members
    SET role = p_role
    WHERE clinic_id = p_clinic_id AND user_id = p_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_clinic_staff(p_clinic_id uuid)
 RETURNS TABLE(user_id uuid, full_name text, email text, phone text, crn text, role text, is_active boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Check permissions (must be a member of the clinic to query its staff)
    SELECT cm.role INTO v_caller_role 
    FROM public.clinic_members cm
    WHERE cm.clinic_id = p_clinic_id AND cm.user_id = auth.uid()
    LIMIT 1;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Acesso negado. Você não é membro desta clínica.';
    END IF;

    RETURN QUERY
    SELECT 
        cm.user_id,
        p.full_name,
        u.email::TEXT,
        p.phone,
        p.crn,
        cm.role,
        p.is_active,
        p.created_at
    FROM public.clinic_members cm
    JOIN public.profiles p ON p.id = cm.user_id
    JOIN auth.users u ON u.id = cm.user_id
    WHERE cm.clinic_id = p_clinic_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_user_master(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_superadmin BOOLEAN;
BEGIN
    -- Check if caller is superadmin
    SELECT is_superadmin INTO v_is_superadmin
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_is_superadmin IS NOT TRUE THEN
        RAISE EXCEPTION 'Acesso negado. Apenas administradores Master podem excluir usuários.';
    END IF;

    -- Prevent self-deletion
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Você não pode excluir seu próprio perfil Master.';
    END IF;

    -- Delete user from auth.users (will cascade delete profiles, clinic_members, etc.)
    DELETE FROM auth.users WHERE id = p_user_id;
END;
$function$;