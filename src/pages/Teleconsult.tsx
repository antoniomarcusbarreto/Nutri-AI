import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import type { DailyCall } from '@daily-co/daily-js';
import { ArrowLeft, CalendarClock, Captions, PhoneOff, Video } from 'lucide-react';
import { Button, ConfirmDialog } from '../components/ui';
import { TeleconsultRoom } from '../components/teleconsult/TeleconsultRoom';
import { TeleconsultConsentGate } from '../components/teleconsult/TeleconsultConsentGate';
import { TeleconsultSidePanel } from '../components/teleconsult/TeleconsultSidePanel';
import { TranscriptionBanner } from '../components/teleconsult/TranscriptionBanner';
import { useTranscriptionActive } from '../components/teleconsult/useTranscriptionActive';
import { useTeleconsultTranscription } from '../components/teleconsult/useTeleconsultTranscription';
import { useToast } from '../contexts/ToastContext';
import {
  decideConsent, endTeleconsult, getConsentState, getTranscriptByAppointment, joinTeleconsult,
  teleconsultReviewPath, TeleconsultError, type ConsentState, type TeleconsultAppMessage, type TeleconsultSession,
} from '../lib/teleconsult';
import { TELECONSULT_TERMS_VERSION } from '../lib/teleconsultTerms';

/**
 * Tela cheia da teleconsulta (fora do Layout/PortalLayout). A mesma página
 * atende os dois lados; quem pode entrar é decidido pela Edge Function
 * `teleconsult-join`.
 *
 * - Paciente: antes da sala, responde ao termo da transcrição (0044) e, na
 *   chamada, pode parar a transcrição a qualquer momento.
 * - Nutricionista: painel com o termo do paciente e a transcrição; ao sair ou
 *   encerrar, vai para a revisão do rascunho (salvar no histórico ou descartar).
 */
export const Teleconsult: React.FC<{ asPatient?: boolean }> = ({ asPatient = false }) => {
  const { appointmentId = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [session, setSession] = useState<TeleconsultSession | null>(null);
  const [error, setError] = useState<TeleconsultError | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [call, setCall] = useState<DailyCall | null>(null);
  const [joined, setJoined] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // Paciente: decisão sobre o termo (undefined = ainda carregando).
  const [patientConsent, setPatientConsent] = useState<ConsentState | null | undefined>(undefined);
  const [revoking, setRevoking] = useState(false);
  const finishing = useRef(false);

  const isNutritionist = session?.role === 'nutricionista';
  const backTo = asPatient ? '/portal/agenda' : `/agenda?agendamento=${appointmentId}`;
  const goBack = useCallback(() => navigate(backTo, { replace: true }), [navigate, backTo]);

  const tx = useTeleconsultTranscription(appointmentId, call, isNutritionist);
  const transcriptionOn = useTranscriptionActive(call);

  const [attempt, setAttempt] = useState(0);
  const join = () => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    joinTeleconsult(appointmentId)
      .then(async (s) => {
        if (s.role === 'paciente') {
          const state = await getConsentState(appointmentId).catch(() => null);
          if (!cancelled) setPatientConsent(state);
        }
        if (!cancelled) setSession(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof TeleconsultError ? err : new TeleconsultError('Não foi possível entrar na teleconsulta.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointmentId, attempt]);

  // Entrou na sala: o paciente avisa o nutricionista para reler o termo.
  useEffect(() => {
    if (!call) return;
    const onJoined = () => {
      setJoined(true);
      if (asPatient) call.sendAppMessage({ type: 'consent-changed' } satisfies TeleconsultAppMessage, '*');
    };
    call.on('joined-meeting', onJoined);
    return () => { call.off('joined-meeting', onJoined); };
  }, [call, asPatient]);

  // Nutricionista: fecha o rascunho e vai revisar (se houver o que revisar).
  const afterCall = useCallback(async (endRoom: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    const hasDraft = await tx.finalize();
    if (endRoom) {
      try {
        await endTeleconsult(appointmentId);
        showToast('Teleconsulta encerrada. A sala foi apagada.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Não foi possível encerrar a sala.', 'error');
      }
    }
    const pending = hasDraft || await getTranscriptByAppointment(appointmentId)
      .then((t) => !!t && t.status !== 'salva').catch(() => false);
    navigate(pending ? teleconsultReviewPath(appointmentId) : backTo, { replace: true });
  }, [appointmentId, backTo, navigate, showToast, tx]);

  const handleEnd = async () => {
    setEnding(true);
    await afterCall(true);
    setEnding(false);
    setConfirmEnd(false);
  };

  const onLeft = useCallback(() => {
    if (isNutritionist) void afterCall(false);
    else goBack();
  }, [afterCall, goBack, isNutritionist]);

  const revoke = async () => {
    setRevoking(true);
    try {
      await decideConsent(appointmentId, 'revogado', TELECONSULT_TERMS_VERSION);
      call?.sendAppMessage({ type: 'consent-revoked' } satisfies TeleconsultAppMessage, '*');
      setPatientConsent(await getConsentState(appointmentId).catch(() => null));
      showToast('Transcrição interrompida. Nada mais será transcrito nesta consulta.', 'success');
    } catch (err) {
      showToast((err as { message?: string })?.message || 'Não foi possível parar a transcrição.', 'error');
    } finally {
      setRevoking(false);
    }
  };

  const otherName = session
    ? (asPatient ? session.nutritionist_name : session.patient_name) ?? ''
    : '';
  const timeRange = session
    ? `${format(new Date(session.starts_at), 'HH:mm')}–${format(new Date(session.ends_at), 'HH:mm')}`
    : '';
  const needsConsent = !!session && session.role === 'paciente' && patientConsent === null;

  return (
    <div role="main" className="fixed inset-0 z-40 flex flex-col bg-slate-100 font-sans">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-300/50 bg-white px-3 sm:px-5">
        <Button variant="ghost" size="icon" onClick={() => (isNutritionist && joined ? void afterCall(false) : goBack())} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${asPatient ? 'bg-teal-50 text-teal-700' : 'bg-[#5024fc]/10 text-[#5024fc]'}`}>
          <Video className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">
            Teleconsulta{otherName ? ` com ${otherName}` : ''}
          </p>
          {timeRange && <p className="text-xs text-slate-500">{timeRange}</p>}
        </div>
        {isNutritionist && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="lg:hidden"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label="Transcrição"
              aria-expanded={panelOpen}
            >
              <Captions className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<PhoneOff className="h-4 w-4" />}
              onClick={() => setConfirmEnd(true)}
            >
              <span className="hidden sm:inline">Encerrar para todos</span>
              <span className="sm:hidden">Encerrar</span>
            </Button>
          </>
        )}
      </header>

      {session && !needsConsent && transcriptionOn && (
        <TranscriptionBanner
          action={asPatient && patientConsent?.decision === 'aceito' ? (
            <Button variant="secondary" size="sm" loading={revoking} onClick={revoke}>Parar transcrição</Button>
          ) : null}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        {session ? (
          needsConsent ? (
            <div className="min-w-0 flex-1">
              <TeleconsultConsentGate
                appointmentId={appointmentId}
                nutritionistName={session.nutritionist_name}
                onDecided={() => { void getConsentState(appointmentId).then(setPatientConsent).catch(() => setPatientConsent(undefined)); }}
              />
            </div>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <TeleconsultRoom session={session} onLeft={onLeft} onCall={setCall} />
              </div>
              {isNutritionist && (
                <TeleconsultSidePanel
                  consent={tx.consent}
                  joined={joined}
                  transcribing={tx.transcribing}
                  busy={tx.busy}
                  error={tx.error}
                  lines={tx.lines}
                  onStart={() => void tx.start()}
                  onPause={() => void tx.pause()}
                  open={panelOpen}
                  onClose={() => setPanelOpen(false)}
                />
              )}
            </>
          )
        ) : (
          <div className="grid flex-1 place-items-center px-4">
            {loading ? (
              <p className="text-sm text-slate-500">Preparando a sala…</p>
            ) : (
              <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                  <CalendarClock className="h-6 w-6" aria-hidden="true" />
                </span>
                <h1 className="mt-4 text-lg font-semibold text-slate-900">Não deu para entrar agora</h1>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{error?.message}</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button variant="secondary" onClick={goBack} className={asPatient ? 'h-11' : ''}>Voltar</Button>
                  {error?.status !== 403 && (
                    <Button onClick={join} className={asPatient ? 'h-11' : ''}>Tentar de novo</Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={handleEnd}
        confirming={ending}
        tone="primary"
        title="Encerrar a teleconsulta?"
        message={tx.transcriptId
          ? 'A sala é apagada agora e todos saem da chamada. Em seguida você revisa a transcrição e decide se salva no histórico.'
          : 'A sala é apagada agora e todos saem da chamada. Se precisar voltar, uma sala nova é criada dentro do horário.'}
        confirmLabel="Encerrar"
      />
    </div>
  );
};

export default Teleconsult;
