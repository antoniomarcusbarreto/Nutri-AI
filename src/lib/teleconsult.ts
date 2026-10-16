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

export const teleconsultReviewPath = (appointmentId: string) => `/teleconsulta/${appointmentId}/revisao`;

// ---------------------------------------------------------------------------
// Fase 2 — consentimento, transcrição e resumo (migration 0044)
// ---------------------------------------------------------------------------

export type ConsentDecision = 'aceito' | 'recusado' | 'revogado';

export interface ConsentState {
  decision: ConsentDecision;
  terms_version: string;
  decided_at: string;
}

/** Última decisão do paciente (paciente da consulta ou nutricionista responsável). */
export async function getConsentState(appointmentId: string): Promise<ConsentState | null> {
  const { data, error } = await supabase
    .rpc('teleconsult_consent_state', { p_appointment_id: appointmentId })
    .maybeSingle<ConsentState>();
  if (error) throw error;
  return data ?? null;
}

/** Portal: o paciente aceita, recusa ou revoga. */
export async function decideConsent(appointmentId: string, decision: ConsentDecision, version: string): Promise<void> {
  const { error } = await supabase.rpc('portal_teleconsult_consent', {
    p_appointment_id: appointmentId,
    p_decision: decision,
    p_version: version,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export type TranscriptStatus = 'em_andamento' | 'rascunho' | 'salva';
export type Speaker = 'nutricionista' | 'paciente' | 'outro';

export interface TranscriptSegment {
  id: string;
  speaker: Speaker;
  text: string;
  spoken_at: string;
}

export interface TeleconsultSummary {
  resumo_geral: string;
  queixas: string[];
  historico_relevante: string[];
  habitos: {
    alimentacao?: string | null;
    sono?: string | null;
    atividade_fisica?: string | null;
    hidratacao?: string | null;
    outros?: string | null;
  };
  condutas: string[];
  metas: { descricao: string; prazo?: string | null }[];
  pontos_atencao: string[];
  proximos_passos: string[];
}

export interface TeleconsultTranscript {
  id: string;
  appointment_id: string;
  clinic_id: string;
  patient_id: string;
  nutritionist_id: string;
  status: TranscriptStatus;
  started_at: string;
  ended_at: string | null;
  saved_at: string | null;
  summary: TeleconsultSummary | null;
  summary_model: string | null;
  summary_generated_at: string | null;
}

export const TRANSCRIPT_COLUMNS =
  'id, appointment_id, clinic_id, patient_id, nutritionist_id, status, started_at, ended_at, saved_at, summary, summary_model, summary_generated_at';

/** Começa ou retoma a transcrição (exige o aceite do paciente). */
export async function startTranscript(appointmentId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_teleconsult_transcript', { p_appointment_id: appointmentId });
  if (error) throw error;
  return data as string;
}

/** Fim da chamada: vira rascunho. `false` = não havia texto (nada a revisar). */
export async function finishTranscript(transcriptId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('finish_teleconsult_transcript', { p_transcript_id: transcriptId });
  if (error) throw error;
  return Boolean(data);
}

export async function saveTranscript(transcriptId: string, summary: TeleconsultSummary | null): Promise<void> {
  const { error } = await supabase.rpc('save_teleconsult_transcript', { p_transcript_id: transcriptId, p_summary: summary });
  if (error) throw error;
}

export async function discardTranscript(transcriptId: string): Promise<void> {
  const { error } = await supabase.from('teleconsult_transcripts').delete().eq('id', transcriptId);
  if (error) throw error;
}

export async function generateSummary(transcriptId: string): Promise<TeleconsultSummary> {
  const { data, error } = await supabase.functions.invoke('teleconsult-summary', {
    body: { transcript_id: transcriptId },
  });
  if (error) throw await toTeleconsultError(error, 'Não foi possível gerar o resumo.');
  return (data as { summary: TeleconsultSummary }).summary;
}

/** Mensagens entre os participantes da chamada (Daily app-message). */
export type TeleconsultAppMessage =
  | { type: 'consent-changed' }
  | { type: 'consent-revoked' };

/** Transcrição da consulta (RLS: só o dono ou quem recebeu compartilhamento). */
export async function getTranscriptByAppointment(appointmentId: string): Promise<TeleconsultTranscript | null> {
  const { data, error } = await supabase
    .from('teleconsult_transcripts')
    .select(TRANSCRIPT_COLUMNS)
    .eq('appointment_id', appointmentId)
    .maybeSingle<TeleconsultTranscript>();
  if (error) throw error;
  return data ?? null;
}

export async function getTranscriptSegments(transcriptId: string): Promise<TranscriptSegment[]> {
  const { data, error } = await supabase
    .from('teleconsult_transcript_segments')
    .select('id, speaker, text, spoken_at')
    .eq('transcript_id', transcriptId)
    .order('spoken_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as TranscriptSegment[];
}
