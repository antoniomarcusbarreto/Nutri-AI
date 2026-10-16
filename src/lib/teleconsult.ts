import { supabase } from './supabase';

/**
 * Teleconsulta pelo Daily.co (migration 0043). A sala e o token saem da Edge
 * Function `teleconsult-join`, que só atende o nutricionista responsável e o
 * paciente da consulta. A janela abaixo espelha a da função: abre 10 min
 * antes do horário e fecha 30 min depois do fim.
 */

export type Modality = 'presencial' | 'online';

export const MODALITY_LABEL: Record<Modality, string> = {
  presencial: 'Presencial',
  online: 'Online',
};

/** Sugestão inicial a partir do serviço (`hibrido` começa como presencial). */
export const modalityFromService = (serviceModality: string | null | undefined): Modality =>
  serviceModality === 'online' ? 'online' : 'presencial';

const OPEN_BEFORE_MS = 10 * 60_000;
const CLOSE_AFTER_MS = 30 * 60_000;

export interface TeleconsultWindow {
  opensAt: Date;
  closesAt: Date;
  state: 'antes' | 'aberta' | 'encerrada';
}

export function teleconsultWindow(dateTime: string, durationMinutes: number | null | undefined, now = new Date()): TeleconsultWindow {
  const start = new Date(dateTime).getTime();
  const opensAt = new Date(start - OPEN_BEFORE_MS);
  const closesAt = new Date(start + (durationMinutes || 60) * 60_000 + CLOSE_AFTER_MS);
  const t = now.getTime();
  const state = t < opensAt.getTime() ? 'antes' : t > closesAt.getTime() ? 'encerrada' : 'aberta';
  return { opensAt, closesAt, state };
}

export interface TeleconsultSession {
  room_url: string;
  token: string;
  role: 'nutricionista' | 'paciente';
  starts_at: string;
  ends_at: string;
  closes_at: string;
  patient_name: string | null;
  nutritionist_name: string | null;
}

export class TeleconsultError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'TeleconsultError';
    this.status = status;
  }
}

async function toTeleconsultError(error: unknown, fallback: string): Promise<TeleconsultError> {
  // supabase-js: FunctionsHttpError (não-2xx) traz .context: Response
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.status === 'number') {
    let serverMsg: string | undefined;
    try { serverMsg = (await ctx.clone().json())?.error; } catch { /* corpo não-JSON */ }
    return new TeleconsultError(serverMsg || fallback, ctx.status);
  }
  return new TeleconsultError('Falha de conexão. Verifique a internet e tente de novo.');
}

export async function joinTeleconsult(appointmentId: string): Promise<TeleconsultSession> {
  const { data, error } = await supabase.functions.invoke('teleconsult-join', {
    body: { appointment_id: appointmentId },
  });
  if (error) throw await toTeleconsultError(error, 'Não foi possível entrar na teleconsulta.');
  return data as TeleconsultSession;
}

/** Só o nutricionista responsável: apaga a sala no Daily na hora. */
export async function endTeleconsult(appointmentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('teleconsult-end', {
    body: { appointment_id: appointmentId },
  });
  if (error) throw await toTeleconsultError(error, 'Não foi possível encerrar a sala.');
}

export const teleconsultPath = (appointmentId: string, asPatient = false) =>
  asPatient ? `/portal/teleconsulta/${appointmentId}` : `/teleconsulta/${appointmentId}`;
