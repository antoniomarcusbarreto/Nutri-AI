import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall, DailyEventObjectTranscriptionMessage } from '@daily-co/daily-js';
import { supabase } from '../../lib/supabase';
import {
  finishTranscript, getConsentState, startTranscript,
  type ConsentState, type Speaker, type TeleconsultAppMessage, type TranscriptSegment,
} from '../../lib/teleconsult';

/**
 * Transcrição pelo navegador do nutricionista (migration 0044).
 *
 * O Daily manda cada trecho reconhecido (`transcription-message`) para todos
 * na chamada; só este lado guarda. Os trechos vão para o Supabase em lotes a
 * cada 10 s (e ao fechar a aba), como RASCUNHO: o banco recusa qualquer
 * trecho sem o aceite do paciente valendo. No fim, `finalize()` fecha o
 * rascunho para a revisão.
 */
const FLUSH_MS = 10_000;
const PREVIEW_LINES = 40;

export interface LiveLine { id: string; speaker: Speaker; text: string }

const speakerOf = (call: DailyCall, sessionId: string): Speaker => {
  const p = Object.values(call.participants()).find((x) => x.session_id === sessionId);
  const uid = p?.user_id ?? '';
  return uid.startsWith('n_') ? 'nutricionista' : uid.startsWith('p_') ? 'paciente' : 'outro';
};

export function useTeleconsultTranscription(appointmentId: string, call: DailyCall | null, enabled: boolean) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [revokedAt, setRevokedAt] = useState<number | null>(null);

  const buffer = useRef<TranscriptSegment[]>([]);
  const transcriptRef = useRef<string | null>(null);
  const flushing = useRef<Promise<void> | null>(null);

  const refreshConsent = useCallback(async () => {
    if (!enabled) return;
    try { setConsent(await getConsentState(appointmentId)); } catch { /* tenta de novo no próximo evento */ }
  }, [appointmentId, enabled]);

  const flush = useCallback(async () => {
    if (flushing.current) await flushing.current;
    const id = transcriptRef.current;
    if (!id || buffer.current.length === 0) return;
    const batch = buffer.current.splice(0, buffer.current.length);
    flushing.current = (async () => {
      const { error: insertError } = await supabase
        .from('teleconsult_transcript_segments')
        .upsert(batch.map((s) => ({ ...s, transcript_id: id })), { onConflict: 'id', ignoreDuplicates: true });
      if (insertError) {
        // 42501 = sem aceite valendo (o paciente revogou): descarta o lote.
        if (insertError.code !== '42501') buffer.current.unshift(...batch);
        else setError('O paciente não autoriza mais a transcrição. Os trechos novos não foram salvos.');
      }
    })();
    try { await flushing.current; } finally { flushing.current = null; }
  }, []);

  // Eventos da chamada: trechos, início/fim da transcrição, avisos do paciente.
  useEffect(() => {
    if (!call || !enabled) return;
    const onMessage = (ev: DailyEventObjectTranscriptionMessage) => {
      const text = ev.text?.trim();
      if (!text || !transcriptRef.current) return;
      const seg: TranscriptSegment = {
        id: crypto.randomUUID(),
        speaker: speakerOf(call, ev.participantId),
        text: text.slice(0, 4000),
        spoken_at: new Date(ev.timestamp ?? Date.now()).toISOString(),
      };
      buffer.current.push(seg);
      setLines((prev) => [...prev.slice(-(PREVIEW_LINES - 1)), { id: seg.id, speaker: seg.speaker, text: seg.text }]);
    };
    const onStarted = () => setTranscribing(true);
    const onStopped = () => { setTranscribing(false); void flush(); };
    const onTxError = (ev: { errorMsg?: string }) => {
      setTranscribing(false);
      setError(ev?.errorMsg ? `Transcrição: ${ev.errorMsg}` : 'A transcrição parou por um erro.');
    };
    const onAppMessage = (ev?: { data?: TeleconsultAppMessage }) => {
      if (ev?.data?.type === 'consent-revoked') {
        try { call.stopTranscription(); } catch { /* já parada */ }
        setRevokedAt(Date.now());
      }
      void refreshConsent();
    };
    const onParticipant = () => void refreshConsent();

    call.on('transcription-message', onMessage);
    call.on('transcription-started', onStarted);
    call.on('transcription-stopped', onStopped);
    call.on('transcription-error', onTxError);
    call.on('app-message', onAppMessage);
    call.on('participant-joined', onParticipant);
    return () => {
      call.off('transcription-message', onMessage);
      call.off('transcription-started', onStarted);
      call.off('transcription-stopped', onStopped);
      call.off('transcription-error', onTxError);
      call.off('app-message', onAppMessage);
      call.off('participant-joined', onParticipant);
    };
  }, [call, enabled, flush, refreshConsent]);

  // Lotes a cada 10 s e ao esconder/fechar a aba.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void flush(), FLUSH_MS);
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled, flush]);

  // Estado do termo ao abrir e, enquanto o paciente não decidir, a cada 15 s.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => { if (alive) void refreshConsent(); };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 15_000);
    return () => { alive = false; window.clearTimeout(first); window.clearInterval(id); };
  }, [enabled, refreshConsent]);

  const start = useCallback(async () => {
    if (!call) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startTranscript(appointmentId);
      transcriptRef.current = id;
      setTranscriptId(id);
      call.startTranscription({ language: 'pt-BR', model: 'nova-2', punctuate: true });
    } catch (err) {
      setError((err as { message?: string })?.message || 'Não foi possível iniciar a transcrição.');
      void refreshConsent();
    } finally {
      setBusy(false);
    }
  }, [appointmentId, call, refreshConsent]);

  const pause = useCallback(async () => {
    try { call?.stopTranscription(); } catch { /* já parada */ }
    await flush();
  }, [call, flush]);

  /** Para, envia o que falta e fecha o rascunho. `true` = há texto para revisar. */
  const finalize = useCallback(async (): Promise<boolean> => {
    if (transcribing) { try { call?.stopTranscription(); } catch { /* já parada */ } }
    await flush();
    const id = transcriptRef.current;
    if (!id) return false;
    try { return await finishTranscript(id); } catch { return true; }
  }, [call, flush, transcribing]);

  return { consent, refreshConsent, transcriptId, transcribing, busy, error, lines, revokedAt, start, pause, finalize };
}
