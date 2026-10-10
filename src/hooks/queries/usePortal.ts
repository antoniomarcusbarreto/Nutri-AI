import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import type { MealPlanData } from '../../types/mealPlan';
import type { AppointmentChangeRequest, PortalAppointment, PortalRequest } from '../../types/portal';

/**
 * Leituras e ações do Portal do Paciente (migrations 0031/0032).
 *
 * Consultas vêm de `portal_appointments()` (já com serviço e profissional); o
 * plano vem de `meal_plans` direto, porque o RLS deixa o paciente ler os
 * próprios planos — inclusive com o prazo vencido. Horários livres vêm de
 * `portal_available_slots()`, que devolve só os horários, nunca as consultas.
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

/** Pedidos de remarcação/retorno do paciente: abertos e respondidos nos últimos 14 dias. */
export function usePortalRequests(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.portal.requests(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<PortalRequest[]> => {
      const { data, error } = await supabase.rpc('portal_requests');
      if (error) throw error;
      return (data ?? []) as PortalRequest[];
    },
  });
}

/** Horários livres (ISO) entre `from` e `to` (YYYY-MM-DD). Com `appointmentId`, para remarcar essa consulta. */
export function usePortalSlots(
  patientId: string | undefined,
  from: string,
  to: string,
  appointmentId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: qk.portal.slots(patientId ?? 'none', from, to, appointmentId ?? 'new'),
    enabled: !!patientId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('portal_available_slots', {
        p_from: from,
        p_to: to,
        p_appointment_id: appointmentId,
      });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((row) =>
        typeof row === 'string' ? row : String(Object.values(row as Record<string, unknown>)[0]),
      );
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

/**
 * Aviso por e-mail do pedido (Edge Function `schedule-notify`, migration 0035).
 * Melhor esforço: não bloqueia a interface nem mostra erro — o pedido já foi
 * gravado. `mine_latest` = o pedido mais recente do paciente logado (as RPCs
 * do portal não devolvem o id).
 */
function notifySchedule(body: { request_id: string } | { mine_latest: true }) {
  void supabase.functions.invoke('schedule-notify', { body }).catch(() => undefined);
}

/** Ações do paciente sobre consultas e pedidos — todas pelas RPCs do portal. */
export function usePortalAppointmentActions() {
  const client = useQueryClient();
  // Pedidos mexem em consultas, pedidos e horários livres ao mesmo tempo.
  const invalidate = () => client.invalidateQueries({ queryKey: qk.portal.all });

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
    onSuccess: () => {
      notifySchedule({ mine_latest: true });
      invalidate();
    },
  });

  const requestReschedule = useMutation({
    mutationFn: async (input: { appointmentId: string; slot: string; note?: string }) => {
      const { error } = await supabase.rpc('portal_request_reschedule', {
        p_appointment_id: input.appointmentId,
        p_slot: input.slot,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => notifySchedule({ mine_latest: true }),
    onSettled: invalidate,
  });

  const requestBooking = useMutation({
    mutationFn: async (input: { slot: string; note?: string }) => {
      const { error } = await supabase.rpc('portal_request_booking', {
        p_slot: input.slot,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => notifySchedule({ mine_latest: true }),
    onSettled: invalidate,
  });

  const respondProposal = useMutation({
    mutationFn: async (input: { requestId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('portal_respond_proposal', {
        p_request_id: input.requestId,
        p_accept: input.accept,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => notifySchedule({ request_id: input.requestId }),
    onSettled: invalidate,
  });

  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.rpc('portal_cancel_request', { p_request_id: requestId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { confirm, cancel, requestReschedule, requestBooking, respondProposal, cancelRequest };
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

/**
 * Pedidos de pacientes que a equipe enxerga (RLS recorta por profissional):
 * os que pedem ação (`pendente`) e os que esperam o paciente (`proposto`).
 */
export function usePendingChangeRequests(clinicId: string | undefined) {
  return useQuery({
    queryKey: qk.changeRequests.pending(clinicId ?? 'none'),
    enabled: !!clinicId,
    queryFn: async (): Promise<AppointmentChangeRequest[]> => {
      const { data, error } = await supabase
        .from('appointment_change_requests')
        .select('id, appointment_id, patient_id, clinic_id, nutritionist_id, service_id, kind, preferred_times, requested_at, proposed_at, response_note, note, status, duration_minutes, created_at, patients(name)')
        .eq('clinic_id', clinicId!)
        .in('status', ['pendente', 'proposto'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AppointmentChangeRequest[];
    },
  });
}

export function useHandleChangeRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; status: 'aceito' | 'recusado'; durationMinutes?: number | null }) => {
      const { error } = await supabase.rpc('handle_change_request', {
        p_request_id: input.requestId,
        p_status: input.status,
        p_duration_minutes: input.durationMinutes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => notifySchedule({ request_id: input.requestId }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.changeRequests.all });
      client.invalidateQueries({ queryKey: qk.dashboard.all });
      client.invalidateQueries({ queryKey: qk.availability.all });
    },
  });
}

/** A equipe sugere outra data; vale quando o paciente aceitar no app. */
export function useProposeChangeRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; proposedAt: string; note?: string; durationMinutes?: number | null }) => {
      const { error } = await supabase.rpc('propose_change_request', {
        p_request_id: input.requestId,
        p_proposed_at: input.proposedAt,
        p_note: input.note || null,
        p_duration_minutes: input.durationMinutes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => notifySchedule({ request_id: input.requestId }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: qk.changeRequests.all });
      client.invalidateQueries({ queryKey: qk.dashboard.all });
      client.invalidateQueries({ queryKey: qk.availability.all });
    },
  });
}

/** Horários livres de um profissional (para a equipe sugerir outra data). */
export function useStaffSlots(input: {
  nutritionistId: string | null;
  from: string;
  to: string;
  minutes: number;
  excludeAppointmentId: string | null;
  excludeRequestId: string | null;
  enabled: boolean;
}) {
  const { nutritionistId, from, to, minutes, excludeAppointmentId, excludeRequestId, enabled } = input;
  return useQuery({
    queryKey: qk.availability.staffSlots(nutritionistId ?? 'none', from, to, minutes, excludeAppointmentId ?? '', excludeRequestId ?? ''),
    enabled: !!nutritionistId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('staff_available_slots', {
        p_nutritionist_id: nutritionistId,
        p_from: from,
        p_to: to,
        p_minutes: minutes,
        p_exclude_appointment: excludeAppointmentId,
        p_exclude_request: excludeRequestId,
      });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((row) =>
        typeof row === 'string' ? row : String(Object.values(row as Record<string, unknown>)[0]),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Grade de horários do profissional (Configurações)
// ---------------------------------------------------------------------------

export interface AvailabilityRange {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

/**
 * Bloqueio de agenda (migration 0035):
 *   - toda semana: `weekday` + `start_time`/`end_time` (validade opcional em starts_on/ends_on);
 *   - numa data com horário: starts_on = ends_on + `start_time`/`end_time`;
 *   - dia inteiro / período: starts_on/ends_on sem horário.
 */
export interface TimeOff {
  id: string;
  weekday: number | null;
  starts_on: string | null;
  ends_on: string | null;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

export type NewTimeOff =
  | { kind: 'weekly'; weekday: number; startTime: string; endTime: string; startsOn?: string; endsOn?: string; reason?: string }
  | { kind: 'date'; date: string; startTime: string; endTime: string; reason?: string }
  | { kind: 'period'; startsOn: string; endsOn: string; reason?: string };

/** Regras da agenda online do profissional (padrões quando não configurado). */
export interface ScheduleSettings {
  buffer_minutes: number;
  slot_step_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
}
export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  buffer_minutes: 0,
  slot_step_minutes: 30,
  min_notice_hours: 12,
  max_days_ahead: 60,
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export function useAvailability(nutritionistId: string | undefined) {
  return useQuery({
    queryKey: qk.availability.byNutritionist(nutritionistId ?? 'none'),
    enabled: !!nutritionistId,
    queryFn: async (): Promise<{ ranges: AvailabilityRange[]; timeOff: TimeOff[]; settings: ScheduleSettings }> => {
      const today = new Date().toISOString().slice(0, 10);
      const [ranges, timeOff, settings] = await Promise.all([
        supabase.from('nutritionist_availability')
          .select('id, weekday, start_time, end_time')
          .eq('nutritionist_id', nutritionistId!)
          .order('weekday').order('start_time'),
        supabase.from('nutritionist_time_off')
          .select('id, weekday, starts_on, ends_on, start_time, end_time, reason')
          .eq('nutritionist_id', nutritionistId!)
          // Bloqueios ainda vigentes (semanais sem fim sempre entram).
          .or(`ends_on.is.null,ends_on.gte.${today}`)
          .order('weekday', { nullsFirst: false }).order('starts_on').order('start_time'),
        supabase.from('nutritionist_schedule_settings')
          .select('buffer_minutes, slot_step_minutes, min_notice_hours, max_days_ahead')
          .eq('nutritionist_id', nutritionistId!)
          .maybeSingle(),
      ]);
      if (ranges.error) throw ranges.error;
      if (timeOff.error) throw timeOff.error;
      if (settings.error) throw settings.error;
      return {
        ranges: (ranges.data ?? []).map((r) => ({ ...r, start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) })),
        timeOff: ((timeOff.data ?? []) as TimeOff[]).map((t) => ({ ...t, start_time: hhmm(t.start_time), end_time: hhmm(t.end_time) })),
        settings: (settings.data as ScheduleSettings | null) ?? DEFAULT_SCHEDULE_SETTINGS,
      };
    },
  });
}

export function useAvailabilityMutations(clinicId: string | undefined, nutritionistId: string | undefined) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: qk.availability.all });

  /** Substitui a grade inteira (é pequena: poucas faixas por dia). */
  const saveRanges = useMutation({
    mutationFn: async (ranges: AvailabilityRange[]) => {
      if (!clinicId || !nutritionistId) throw new Error('Sem clínica.');
      const { error: delError } = await supabase.from('nutritionist_availability').delete().eq('nutritionist_id', nutritionistId);
      if (delError) throw delError;
      if (ranges.length === 0) return;
      const { error } = await supabase.from('nutritionist_availability').insert(
        ranges.map((r) => ({
          clinic_id: clinicId,
          nutritionist_id: nutritionistId,
          weekday: r.weekday,
          start_time: r.start_time,
          end_time: r.end_time,
        })),
      );
      if (error) throw error;
    },
    onSettled: invalidate,
  });

  const addTimeOff = useMutation({
    mutationFn: async (input: NewTimeOff) => {
      if (!clinicId || !nutritionistId) throw new Error('Sem clínica.');
      const base = { clinic_id: clinicId, nutritionist_id: nutritionistId, reason: input.reason || null };
      const row =
        input.kind === 'weekly'
          ? { ...base, weekday: input.weekday, start_time: input.startTime, end_time: input.endTime, starts_on: input.startsOn || null, ends_on: input.endsOn || null }
          : input.kind === 'date'
            ? { ...base, starts_on: input.date, ends_on: input.date, start_time: input.startTime, end_time: input.endTime }
            : { ...base, starts_on: input.startsOn, ends_on: input.endsOn };
      const { error } = await supabase.from('nutritionist_time_off').insert(row as Record<string, unknown>);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeTimeOff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('nutritionist_time_off').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const saveSettings = useMutation({
    mutationFn: async (settings: ScheduleSettings) => {
      if (!clinicId || !nutritionistId) throw new Error('Sem clínica.');
      const { error } = await supabase.from('nutritionist_schedule_settings').upsert(
        { ...settings, nutritionist_id: nutritionistId, clinic_id: clinicId, updated_at: new Date().toISOString() },
        { onConflict: 'nutritionist_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { saveRanges, addTimeOff, removeTimeOff, saveSettings };
}

export type ScheduleConflict = 'consulta' | 'bloqueio' | 'fora_da_grade' | null;

/**
 * Aviso de conflito ao agendar pela Agenda (não impede salvar — encaixe é
 * decisão da equipe). Consulta só quando data, hora e profissional estão completos.
 */
export function useScheduleConflict(input: {
  nutritionistId: string | null | undefined;
  start: Date | null;
  minutes: number | null;
  excludeAppointmentId?: string | null;
}) {
  const { nutritionistId, start, minutes, excludeAppointmentId } = input;
  const startIso = start && !Number.isNaN(start.getTime()) ? start.toISOString() : null;
  return useQuery({
    queryKey: ['availability', 'conflict', nutritionistId ?? '', startIso ?? '', minutes ?? 0, excludeAppointmentId ?? ''],
    enabled: !!nutritionistId && !!startIso && !!minutes,
    staleTime: 15_000,
    queryFn: async (): Promise<{ conflict: ScheduleConflict; withTime: string | null }> => {
      const { data, error } = await supabase.rpc('check_schedule_conflict', {
        p_nutritionist_id: nutritionistId,
        p_start: startIso,
        p_minutes: minutes,
        p_exclude_appointment: excludeAppointmentId ?? null,
      });
      if (error) throw error;
      const d = (data ?? {}) as { conflict?: ScheduleConflict; with_time?: string | null };
      return { conflict: d.conflict ?? null, withTime: d.with_time ?? null };
    },
  });
}

// ---------------------------------------------------------------------------
// Ficha de saúde (pré-consulta) preenchida pelo paciente — migration 0033
// ---------------------------------------------------------------------------

export interface PortalHealth {
  allergies: string;
  dietary_restrictions: string;
  pathologies: string;
  medications: string;
  physical_activity_level: string;
  profession: string;
  sleep_quality: string;
  updated_at: string | null;
}

/** Ficha "preenchida" = os três campos obrigatórios têm conteúdo. */
export const isHealthComplete = (h: PortalHealth | null | undefined) =>
  !!h && [h.physical_activity_level, h.profession, h.sleep_quality].every((v) => v.trim() !== '');

export function usePortalHealth(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.portal.health(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<PortalHealth> => {
      // RLS (0029, patient_health_self_select): o paciente lê só a própria ficha.
      const { data, error } = await supabase
        .from('patient_health')
        .select('allergies, dietary_restrictions, pathologies, medications, physical_activity_level, profession, sleep_quality, updated_at')
        .eq('patient_id', patientId!)
        .maybeSingle();
      if (error) throw error;
      return {
        allergies: data?.allergies ?? '',
        dietary_restrictions: data?.dietary_restrictions ?? '',
        pathologies: data?.pathologies ?? '',
        medications: data?.medications ?? '',
        physical_activity_level: data?.physical_activity_level ?? '',
        profession: data?.profession ?? '',
        sleep_quality: data?.sleep_quality ?? '',
        updated_at: data?.updated_at ?? null,
      };
    },
  });
}

export function useSavePortalHealth(patientId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (h: Omit<PortalHealth, 'updated_at'>) => {
      const { error } = await supabase.rpc('portal_save_health', {
        p_allergies: h.allergies,
        p_dietary_restrictions: h.dietary_restrictions,
        p_pathologies: h.pathologies,
        p_medications: h.medications,
        p_physical_activity_level: h.physical_activity_level,
        p_profession: h.profession,
        p_sleep_quality: h.sleep_quality,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.portal.health(patientId ?? 'none') }),
  });
}
