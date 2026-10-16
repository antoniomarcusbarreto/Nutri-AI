import React, { useEffect, useRef } from 'react';
import { CheckCircle2, CircleDashed, Mic, Pause, ShieldOff, X, XCircle } from 'lucide-react';
import { Button } from '../ui';
import { cn } from '../../lib/cn';
import type { ConsentState } from '../../lib/teleconsult';
import type { LiveLine } from './useTeleconsultTranscription';

/**
 * Painel do nutricionista na chamada: estado do termo do paciente, ligar/pausar
 * a transcrição e a prévia do texto ao vivo. Lateral no desktop; no celular
 * abre por cima da chamada (`open`).
 */
interface Props {
  consent: ConsentState | null;
  joined: boolean;
  transcribing: boolean;
  busy: boolean;
  error: string | null;
  lines: LiveLine[];
  onStart: () => void;
  onPause: () => void;
  open: boolean;
  onClose: () => void;
}

const CONSENT_UI: Record<string, { label: string; detail: string; icon: typeof CheckCircle2; tone: string }> = {
  pendente: {
    label: 'Aguardando o paciente',
    detail: 'O paciente responde ao termo ao entrar pelo portal.',
    icon: CircleDashed,
    tone: 'border-amber-100 bg-amber-50 text-amber-800',
  },
  aceito: {
    label: 'Transcrição autorizada',
    detail: 'O paciente aceitou o termo para esta consulta.',
    icon: CheckCircle2,
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  },
  recusado: {
    label: 'Paciente recusou',
    detail: 'A consulta segue normalmente, sem transcrição.',
    icon: XCircle,
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  revogado: {
    label: 'Paciente parou a transcrição',
    detail: 'Os trechos até aqui ficam no rascunho; nada novo é gravado.',
    icon: ShieldOff,
    tone: 'border-rose-100 bg-rose-50 text-rose-800',
  },
};

const WHO: Record<LiveLine['speaker'], string> = { nutricionista: 'Você', paciente: 'Paciente', outro: 'Outro' };

export const TeleconsultSidePanel: React.FC<Props> = ({
  consent, joined, transcribing, busy, error, lines, onStart, onPause, open, onClose,
}) => {
  const state = CONSENT_UI[consent?.decision ?? 'pendente'];
  const Icon = state.icon;
  const canStart = consent?.decision === 'aceito' && joined && !transcribing;
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length]);

  return (
    <aside
      aria-label="Transcrição"
      className={cn(
        'flex w-full flex-col border-l border-slate-300/50 bg-white lg:static lg:flex lg:w-80 lg:shrink-0',
        open ? 'absolute inset-0 z-10 flex' : 'hidden',
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Transcrição</h2>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label="Fechar painel">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-3 p-4">
        <div className={cn('flex gap-2.5 rounded-xl border px-3 py-2.5', state.tone)}>
          <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium">{state.label}</p>
            <p className="mt-0.5 text-xs opacity-90">{state.detail}</p>
          </div>
        </div>

        {transcribing ? (
          <Button variant="secondary" fullWidth leftIcon={<Pause className="h-4 w-4" />} onClick={onPause}>
            Pausar transcrição
          </Button>
        ) : (
          <Button fullWidth leftIcon={<Mic className="h-4 w-4" />} disabled={!canStart} loading={busy} onClick={onStart}>
            {lines.length ? 'Retomar transcrição' : 'Iniciar transcrição'}
          </Button>
        )}
        {!joined && consent?.decision === 'aceito' && (
          <p className="text-xs text-slate-500">Entre na sala para iniciar.</p>
        )}
        {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
        <p className="text-xs leading-relaxed text-slate-500">
          O texto fica como rascunho só seu. Ao encerrar, você revisa o resumo e decide se salva no histórico do paciente.
        </p>
      </div>

      <ol ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4" aria-live="polite">
        {lines.length === 0 ? (
          <li className="text-xs text-slate-500">{transcribing ? 'Ouvindo…' : 'Os trechos aparecem aqui durante a conversa.'}</li>
        ) : (
          lines.map((l) => (
            <li key={l.id} className="text-sm leading-relaxed text-slate-700">
              <span className={cn('mr-1 font-medium', l.speaker === 'nutricionista' ? 'text-[#5024fc]' : 'text-slate-900')}>
                {WHO[l.speaker]}:
              </span>
              {l.text}
            </li>
          ))
        )}
      </ol>
    </aside>
  );
};
