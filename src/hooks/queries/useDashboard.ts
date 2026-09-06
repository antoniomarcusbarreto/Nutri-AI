import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk, monthKeyOf } from '../../lib/queryKeys';

/** Limites [início, fim] do mês de `d`, em ISO. */
function monthBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export interface ClinicStats {
  patientsCount: number;
  appointmentsInMonth: number;
  mealPlansInMonth: number;
  /** Horas de atendimentos concluídos no mês (duração dos serviços). */
  attendedHours: number;
}

/** Contadores do topo do Dashboard. Refaz só quando muda o mês. */
export function useClinicStats(clinicId: string | undefined, month: Date) {
  const monthKey = monthKeyOf(month);
  return useQuery({
    queryKey: qk.clinic.stats(clinicId ?? 'none', monthKey),
    enabled: !!clinicId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ClinicStats> => {
      const { startISO, endISO } = monthBounds(month);
      // Tudo em paralelo (sem waterfall).
      const [patients, appointments, mealPlans, concluded] = await Promise.all([
        supabase.from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId!).eq('status', 'ativo'),
        supabase.from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId!).gte('date_time', startISO).lte('date_time', endISO),
        supabase.from('meal_plans')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId!).gte('created_at', startISO).lte('created_at', endISO),
        supabase.from('appointments')
          .select('services ( duration_minutes )')
          .eq('clinic_id', clinicId!).eq('status', 'concluido')
          .gte('date_time', startISO).lte('date_time', endISO),
      ]);
      if (patients.error) throw patients.error;
      if (appointments.error) throw appointments.error;
      if (mealPlans.error) throw mealPlans.error;
      if (concluded.error) throw concluded.error;

      type ConcludedRow = { services: { duration_minutes?: number } | { duration_minutes?: number }[] | null };
      const totalMinutes = ((concluded.data ?? []) as ConcludedRow[]).reduce((sum, row) => {
        const s = Array.isArray(row.services) ? row.services[0] : row.services;
        return sum + (s?.duration_minutes ?? 60); // default 60 min quando sem serviço
      }, 0);

      return {
        patientsCount: patients.count ?? 0,
        appointmentsInMonth: appointments.count ?? 0,
        mealPlansInMonth: mealPlans.count ?? 0,
        attendedHours: Math.round(totalMinutes / 60),
      };
    },
  });
}

export interface UpcomingAppointment {
  id: string;
  public_token: string | null;
  clinic_id: string | null;
  patient_id: string | null;
  service_id: string | null;
  nutritionist_id: string | null;
  date_time: string;
  status: string;
  patients: { name?: string | null } | { name?: string | null }[] | null;
  services: { name?: string | null } | { name?: string | null }[] | null;
  profiles: { full_name?: string | null } | { full_name?: string | null }[] | null;
}

/**
 * Próximos 5 agendamentos. Key SEM o mês (PERF-16): não é mais refeito ao
 * navegar entre meses no cabeçalho.
 */
export function useUpcomingAppointments(clinicId: string | undefined) {
  return useQuery({
    queryKey: qk.appointments.upcoming(clinicId ?? 'none'),
    enabled: !!clinicId,
    queryFn: async (): Promise<UpcomingAppointment[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          public_token,
          clinic_id,
          patient_id,
          service_id,
          nutritionist_id,
          date_time,
          status,
          patients:patient_id(name),
          services:service_id(name),
          profiles:nutritionist_id(full_name)
        `)
        .eq('clinic_id', clinicId!)
        .gte('date_time', new Date().toISOString())
        .order('date_time', { ascending: true })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as unknown as UpcomingAppointment[];
    },
  });
}

/** Lembretes do mês selecionado. */
export function useReminders(clinicId: string | undefined, month: Date) {
  const monthKey = monthKeyOf(month);
  return useQuery({
    queryKey: qk.reminders.byMonth(clinicId ?? 'none', monthKey),
    enabled: !!clinicId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { startISO, endISO } = monthBounds(month);
      const { data, error } = await supabase
        .from('reminders')
        .select('*, profiles:user_id(full_name)')
        .eq('clinic_id', clinicId!)
        .gte('due_date', startISO)
        .lte('due_date', endISO)
        .order('is_completed', { ascending: true })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
