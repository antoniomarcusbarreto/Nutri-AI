-- Migration 0013: Master Panel User Management

-- 1. Create delete_user_master function to allow superadmins to completely remove a user
CREATE OR REPLACE FUNCTION public.delete_user_master(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 2. Create allocate_user_to_clinic function to allow superadmins to allocate users to a clinic
CREATE OR REPLACE FUNCTION public.allocate_user_to_clinic(
    p_user_id UUID,
    p_clinic_id UUID,
    p_role TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
