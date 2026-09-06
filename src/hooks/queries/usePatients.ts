import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import type { PatientRow, PatientPickFromAppointments } from '../../types/clinical';

/**
 * Lista de pacientes de uma clínica (Onda 4 / PERF-03).
 *
 * Compartilhada por Pacientes, Exames, Acompanhamento, Planos e Consultas —
 * todos leem a MESMA entrada de cache `['patients','list',clinicId]`, então
 * alternar entre esses módulos não redispara a busca enquanto o dado estiver
 * fresco (staleTime 60s).
 */
export function usePatients(clinicId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.patients.list(clinicId ?? 'none'),
    enabled: !!clinicId && (options?.enabled ?? true),
    queryFn: async (): Promise<PatientRow[]> => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinicId!)
        .order('name');
      if (error) throw error;
      return (data ?? []) as PatientRow[];
    },
  });
}

/**
 * Pacientes ATIVOS que já tiveram agendamento com um nutricionista específico
 * (usado em Planos Alimentares — a lista é escopada ao profissional logado).
 */
export function useNutritionistPatients(nutritionistId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.patients.byNutritionist(nutritionistId ?? 'none'),
    enabled: !!nutritionistId && (options?.enabled ?? true),
    queryFn: async (): Promise<PatientPickFromAppointments[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select('patient_id, date_time, patients ( id, name, email, phone, birth_date, biological_sex, main_goal, status )')
        .eq('nutritionist_id', nutritionistId!)
        .neq('status', 'cancelado')
        .neq('status', 'Cancelado')
        .order('date_time', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as { patients: PatientPickFromAppointments | PatientPickFromAppointments[] | null }[];
      const map = new Map<string, PatientPickFromAppointments>();
      rows.forEach((appt) => {
        const p = Array.isArray(appt.patients) ? appt.patients[0] : appt.patients;
        if (p && p.status === 'ativo' && !map.has(p.id)) map.set(p.id, p);
      });
      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}
