import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import type { MealPlanData } from '../../types/mealPlan';
import type { AppointmentChangeRequest, PortalAppointment } from '../../types/portal';

/**
 * Leituras e ações do Portal do Paciente (migration 0031).
 *
 * Consultas vêm de `portal_appointments()` (já com serviço, profissional e
 * pedido pendente); o plano vem de `meal_plans` direto, porque o RLS deixa o
 * paciente ler os próprios planos — inclusive com o prazo vencido.
 */
export function usePortalAppointments(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.portal.appointments(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<PortalAppointment[]> => {
      const { data, error } = await supabase.rpc('portal_appointments');
      if (error) throw error;
      return (data ?? []) as PortalAppointment[];
    },
  });
}

export interface PortalMealPlan extends MealPlanData {
  id: string;
  created_at: string;
}

/** Plano mais recente do paciente logado (null se ainda não há plano). */
export function usePortalMealPlan(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.portal.mealPlan(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<PortalMealPlan | null> => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, kcal, meals, created_at')
        .eq('patient_id', patientId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PortalMealPlan | null) ?? null;
    },
  });
}

/** Confirmar, cancelar e pedir reagendamento — todas pelas RPCs do portal. */
export function usePortalAppointmentActions(patientId: string | undefined) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: qk.portal.appointments(patientId ?? 'none') });

  const confirm = useMutation({
    mutationFn: async (appointmentId: string) => {
      const { error } = await supabase.rpc('portal_confirm_appointment', { p_appointment_id: appointmentId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (input: { appointmentId: string; note?: string }) => {
      const { error } = await supabase.rpc('portal_cancel_appointment', {
        p_appointment_id: input.appointmentId,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const requestReschedule = useMutation({
    mutationFn: async (input: { appointmentId: string; preferredTimes: string; note?: string }) => {
      const { error } = await supabase.rpc('portal_request_reschedule', {
        p_appointment_id: input.appointmentId,
        p_preferred_times: input.preferredTimes,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { confirm, cancel, requestReschedule };
}

// ---------------------------------------------------------------------------
// Lado da equipe
// ---------------------------------------------------------------------------

/** Convite pendente de um paciente (a equipe não lê a tabela de convites). */
export function usePortalInviteStatus(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.portal.inviteStatus(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<{ pending_expires_at: string | null; last_used_at: string | null }> => {
      const { data, error } = await supabase.rpc('get_portal_invite_status', { p_patient_id: patientId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { pending_expires_at: row?.pending_expires_at ?? null, last_used_at: row?.last_used_at ?? null };
    },
  });
}

/** Gerar convite, renovar e encerrar o acesso de um paciente. */
export function usePortalAccessMutations(patientId: string) {
  const client = useQueryClient();
  const invalidate = () => {
    client.invalidateQueries({ queryKey: qk.portal.inviteStatus(patientId) });
    client.invalidateQueries({ queryKey: qk.patients.all });
  };

  const createInvite = useMutation({
    mutationFn: async (accessUntil: Date): Promise<string> => {
      const { data, error } = await supabase.rpc('create_portal_invite', {
        p_patient_id: patientId,
        p_access_until: accessUntil.toISOString(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
  });

  const setAccess = useMutation({
    mutationFn: async (accessUntil: Date | null) => {
      const { error } = await supabase.rpc('set_portal_access', {
        p_patient_id: patientId,
        p_access_until: accessUntil ? accessUntil.toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { createInvite, setAccess };
}

/** Pedidos pendentes de pacientes que a equipe enxerga (RLS recorta por profissional). */
export function usePendingChangeRequests(clinicId: string | undefined) {
  return useQuery({
    queryKey: qk.changeRequests.pending(clinicId ?? 'none'),
    enabled: !!clinicId,
    queryFn: async (): Promise<AppointmentChangeRequest[]> => {
      const { data, error } = await supabase
        .from('appointment_change_requests')
        .select('id, appointment_id, patient_id, clinic_id, kind, preferred_times, note, status, created_at')
        .eq('clinic_id', clinicId!)
        .eq('status', 'pendente')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentChangeRequest[];
    },
  });
}

export function useHandleChangeRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; status: 'aceito' | 'recusado' }) => {
      const { error } = await supabase.rpc('handle_change_request', {
        p_request_id: input.requestId,
        p_status: input.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.changeRequests.all });
      client.invalidateQueries({ queryKey: qk.dashboard.all });
    },
  });
}
