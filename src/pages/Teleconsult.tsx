import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, CalendarClock, PhoneOff, Video } from 'lucide-react';
import { Button, ConfirmDialog } from '../components/ui';
import { TeleconsultRoom } from '../components/teleconsult/TeleconsultRoom';
import { useToast } from '../contexts/ToastContext';
import {
  endTeleconsult, joinTeleconsult, TeleconsultError, type TeleconsultSession,
} from '../lib/teleconsult';

/**
 * Tela cheia da teleconsulta (fora do Layout/PortalLayout). A mesma página
 * atende os dois lados: `asPatient` muda só o caminho de volta e as ações.
 * Quem pode entrar é decidido pela Edge Function `teleconsult-join`.
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

  const backTo = asPatient ? '/portal/agenda' : `/agenda?agendamento=${appointmentId}`;
  const goBack = useCallback(() => navigate(backTo, { replace: true }), [navigate, backTo]);

  const [attempt, setAttempt] = useState(0);
  const join = () => {
    setLoading(true);
    setError(null);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    joinTeleconsult(appointmentId)
      .then((s) => { if (!cancelled) setSession(s); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof TeleconsultError ? err : new TeleconsultError('Não foi possível entrar na teleconsulta.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appointmentId, attempt]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await endTeleconsult(appointmentId);
      showToast('Teleconsulta encerrada. A sala foi apagada.', 'success');
      goBack();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível encerrar a sala.', 'error');
    } finally {
      setEnding(false);
      setConfirmEnd(false);
    }
  };

  const otherName = session
    ? (asPatient ? session.nutritionist_name : session.patient_name) ?? ''
    : '';
  const timeRange = session
    ? `${format(new Date(session.starts_at), 'HH:mm')}–${format(new Date(session.ends_at), 'HH:mm')}`
    : '';

  return (
    <div role="main" className="fixed inset-0 z-40 flex flex-col bg-slate-100 font-sans">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-300/50 bg-white px-3 sm:px-5">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Voltar">
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
        {session?.role === 'nutricionista' && (
          <Button
            variant="danger"
            size="sm"
            leftIcon={<PhoneOff className="h-4 w-4" />}
            onClick={() => setConfirmEnd(true)}
          >
            <span className="hidden sm:inline">Encerrar para todos</span>
            <span className="sm:hidden">Encerrar</span>
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1">
        {session ? (
          <TeleconsultRoom session={session} onLeft={goBack} />
        ) : (
          <div className="grid h-full place-items-center px-4">
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
        title="Encerrar a teleconsulta?"
        message="A sala é apagada agora e todos saem da chamada. Se precisar voltar, uma sala nova é criada dentro do horário."
        confirmLabel="Encerrar"
      />
    </div>
  );
};

export default Teleconsult;
