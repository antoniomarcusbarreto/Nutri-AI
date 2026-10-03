import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import { PATIENT_SELECT, withHealth, type PatientRow, type PatientPickFromAppointments } from '../../types/clinical';

/**
 * Pacientes visíveis ao usuário numa clínica (Onda 4 / PERF-03).
 *
 * O RLS (migration 0029) já recorta: o nutricionista recebe os pacientes de
 * que é responsável, os concedidos e — só o cadastro — os que têm consulta
 * agendada com ele; a secretária recebe o cadastro de todos. A ficha de saúde
 * vem embutida e achatada só quando há acesso clínico (`has_clinical_access`).
 *
 * Compartilhada por Pacientes, Exames, Acompanhamento e Financeiro — todos
 * leem a MESMA entrada de cache `['patients','list',clinicId]`.
 */
export function usePatients(clinicId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.patients.list(clinicId ?? 'none'),
    enabled: !!clinicId && (options?.enabled ?? true),
    queryFn: async (): Promise<PatientRow[]> => {
      const { data, error } = await supabase
        .from('patients')
        .select(PATIENT_SELECT)
        .eq('clinic_id', clinicId!)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((p) => withHealth(p)) as PatientRow[];
    },
  });
}

/**
 * Pacientes ATIVOS com acesso clínico do profissional logado (os seus e os
 * concedidos) — usado em Planos Alimentares, que grava dado clínico.
 */
export function useNutritionistPatients(nutritionistId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.patients.byNutritionist(nutritionistId ?? 'none'),
    enabled: !!nutritionistId && (options?.enabled ?? true),
    queryFn: async (): Promise<PatientPickFromAppointments[]> => {
      const { data, error } = await supabase
        .from('patients')
        .select('id, name, email, phone, birth_date, biological_sex, main_goal, status')
        .eq('status', 'ativo')
        .eq('has_clinical_access', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as PatientPickFromAppointments[];
    },
  });
}
