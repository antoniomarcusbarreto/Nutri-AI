-- Migration 0011: Edit clinic details and staff member emails

-- 1. Redefining update_staff_member to accept and update email
DROP FUNCTION IF EXISTS public.update_staff_member(UUID, UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_staff_member(
    p_clinic_id UUID,
    p_user_id UUID,
    p_name TEXT,
    p_email TEXT,
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
    -- Check permissions (Only owner or nutritionist of the clinic can manage staff members)
    SELECT cm.role INTO v_caller_role 
    FROM public.clinic_members cm
    WHERE cm.clinic_id = p_clinic_id AND cm.user_id = auth.uid()
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
$$;

-- 2. Create get_clinic_staff function to fetch members with emails securely
CREATE OR REPLACE FUNCTION public.get_clinic_staff(p_clinic_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    crn TEXT,
    role TEXT,
    is_active BOOLEAN,
    created_at timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
