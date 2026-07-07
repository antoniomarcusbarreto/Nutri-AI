-- Migration 0017: Create secure RPC for public meal plan access

CREATE OR REPLACE FUNCTION public.get_patient_meal_plan(p_plan_id UUID, p_birth_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_plan RECORD;
    v_patient RECORD;
    v_nutritionist RECORD;
    v_result JSONB;
BEGIN
    -- 1. Encontrar o plano
    SELECT * INTO v_plan
    FROM public.meal_plans
    WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plano não encontrado';
    END IF;

    -- 2. Encontrar o paciente e verificar a data de nascimento
    SELECT * INTO v_patient
    FROM public.patients
    WHERE id = v_plan.patient_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paciente não encontrado';
    END IF;

    -- Verificar a chave (Data de Nascimento)
    -- Consideramos também se a data no banco for nula, o que impediria o acesso.
    IF v_patient.birth_date IS NULL OR v_patient.birth_date != p_birth_date THEN
        RAISE EXCEPTION 'Data de nascimento incorreta';
    END IF;

    -- 3. Buscar os dados do Nutricionista
    SELECT * INTO v_nutritionist
    FROM public.profiles
    WHERE id = v_plan.nutritionist_id;

    -- 4. Construir e retornar o JSON
    v_result := jsonb_build_object(
        'id', v_plan.id,
        'created_at', v_plan.created_at,
        'kcal', v_plan.kcal,
        'meals', v_plan.meals,
        'patient', jsonb_build_object(
            'id', v_patient.id,
            'name', v_patient.name
        ),
        'nutritionist', jsonb_build_object(
            'id', v_nutritionist.id,
            'name', v_nutritionist.name
        )
    );

    RETURN v_result;
END;
$$;
