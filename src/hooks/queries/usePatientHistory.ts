import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';

/**
 * Histórico clínico de um paciente (Onda 4 / PERF-06).
 *
 * Cada tabela tem seu próprio hook + query key. Usados juntos num componente,
 * as requisições disparam EM PARALELO (o TanStack Query não encadeia) — o que
 * antes eram 4 `await` em série no `loadPatientHistory` do Tracking.
 */

export function useConsultations(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.consultations.byPatient(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultations')
        .select(`
          id,
          anamnese_notes,
          anthropometry_json,
          created_at,
          appointments ( status, services ( name ) )
        `)
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMealPlans(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.mealPlans.byPatient(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, kcal, meals, created_at')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePatientAppointments(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.appointments.byPatient(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date_time,
          status,
          created_at,
          services ( name, modality ),
          consultations ( id, anamnese_notes, anthropometry_json )
        `)
        .eq('patient_id', patientId!)
        .order('date_time', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
