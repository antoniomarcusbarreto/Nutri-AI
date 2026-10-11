import { supabase } from './supabase';

/** Cache do último lembrete de um agendamento (selo na Agenda). */
export const reminderQueryKey = (appointmentId: string) => ['whatsapp-reminder', appointmentId] as const;

/** Motivos pelos quais um pedido de lembrete não entra na fila (migration 0039). */
export type ReminderSkipReason =
  | 'not_found'
  | 'not_pending'
  | 'past'
  | 'no_phone'
  | 'opt_out'
  | 'already_requested'
  | 'too_soon';

export interface ReminderRequestResult {
  requested: number;
  skipped: { appointment_id: string; reason: ReminderSkipReason }[];
}

export const SKIP_REASON_LABEL: Record<ReminderSkipReason, string> = {
  not_found: 'consulta não encontrada',
  not_pending: 'já confirmada ou cancelada',
  past: 'horário já passou',
  no_phone: 'paciente sem telefone',
  opt_out: 'paciente pediu para não receber',
  already_requested: 'lembrete já está na fila',
  too_soon: 'lembrete enviado há menos de 6 horas',
};

/**
 * Pede o lembrete de confirmação pelo WhatsApp. Só consultas pendentes entram;
 * o envio sai pelo workflow do n8n em até 15 minutos.
 */
export async function requestWhatsAppReminders(appointmentIds: string[]): Promise<ReminderRequestResult> {
  const { data, error } = await supabase.rpc('whatsapp_request_reminders', { p_appointment_ids: appointmentIds });
  if (error) throw error;
  return data as ReminderRequestResult;
}

/** Texto curto para o toast depois de um pedido. */
export function describeReminderResult(r: ReminderRequestResult): { text: string; type: 'success' | 'info' | 'error' } {
  if (r.requested > 0) {
    const extra = r.skipped.length ? ` ${r.skipped.length} ficaram de fora.` : '';
    const plural = r.requested > 1;
    return {
      text: `${r.requested} lembrete${plural ? 's' : ''} na fila. ${plural ? 'Saem' : 'Sai'} em até 15 minutos.${extra}`,
      type: 'success',
    };
  }
  if (r.skipped.length === 1) {
    return { text: `Lembrete não enviado: ${SKIP_REASON_LABEL[r.skipped[0].reason] ?? r.skipped[0].reason}.`, type: 'info' };
  }
  return { text: 'Nenhum lembrete para enviar: as consultas já foram confirmadas ou não podem receber.', type: 'info' };
}
