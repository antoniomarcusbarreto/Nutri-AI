/**
 * Portal do Paciente (migration 0031).
 *
 * O paciente nunca lê `patients`/`clinics`/`profiles` direto: o que o portal
 * precisa vem de `portal_context()` e `portal_appointments()`, e toda ação
 * passa por RPC que valida dono, prazo e status.
 */

/** Versão dos termos de uso do portal. Mudou o texto, sobe a versão — o paciente aceita de novo. */
export const PORTAL_TERMS_VERSION = 'portal-v1';

export interface PortalContext {
  patient_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  main_goal: string | null;
  /** Fim do acesso. No passado = somente leitura. */
  access_until: string;
  /** Prazo vigente e paciente ativo: pode agir (confirmar, cancelar, pedir reagendamento). */
  active: boolean;
  terms_version: string | null;
  terms_accepted_at: string | null;
  nutritionist_name: string | null;
  nutritionist_crn: string | null;
  clinic: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
}

export type AppointmentStatus = 'pendente' | 'confirmado' | 'concluido' | 'cancelado';

export interface PortalAppointment {
  id: string;
  date_time: string;
  status: AppointmentStatus;
  service_name: string | null;
  duration_minutes: number | null;
  modality: string | null;
  nutritionist_name: string | null;
  /** Pedido de reagendamento ainda sem resposta da clínica. */
  pending_request_kind: 'reschedule' | null;
  pending_request_at: string | null;
}

/** Pedido do paciente visto pela equipe (`appointment_change_requests`). */
export interface AppointmentChangeRequest {
  id: string;
  appointment_id: string;
  patient_id: string;
  clinic_id: string;
  kind: 'reschedule' | 'cancel';
  preferred_times: string | null;
  note: string | null;
  status: 'pendente' | 'aceito' | 'recusado' | 'cancelado';
  created_at: string;
}

/** Situação do acesso do paciente ao app, do ponto de vista da equipe. */
export type PortalAccessState = 'none' | 'active' | 'expired';

export function portalAccessState(accessUntil: string | null | undefined): PortalAccessState {
  if (!accessUntil) return 'none';
  return new Date(accessUntil).getTime() > Date.now() ? 'active' : 'expired';
}

/** Ação do paciente ainda é possível nesta consulta? (mesma regra do banco) */
export function isActionable(a: Pick<PortalAppointment, 'date_time' | 'status'>): boolean {
  return new Date(a.date_time).getTime() > Date.now() && (a.status === 'pendente' || a.status === 'confirmado');
}
