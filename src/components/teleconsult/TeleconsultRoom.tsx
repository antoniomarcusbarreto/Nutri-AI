import React, { useEffect, useRef, useState } from 'react';
import DailyIframe, { type DailyCall } from '@daily-co/daily-js';
import { Loader2 } from 'lucide-react';
import type { TeleconsultSession } from '../../lib/teleconsult';

/**
 * Chamada do Daily Prebuilt embutida (iframe). A sala de espera, os
 * controles de câmera/microfone e o botão Sair são do próprio Daily; aqui só
 * montamos o frame com o token, aplicamos as cores do NutriAI e avisamos
 * quando a pessoa sai.
 *
 * O objeto da chamada é repassado por `onCall` para quem precisar ouvir os
 * eventos (transcrição, mensagens entre os participantes).
 */
const THEME = {
  light: {
    colors: {
      accent: '#5024fc',
      accentText: '#ffffff',
      background: '#f1f5f9',
      backgroundAccent: '#ffffff',
      baseText: '#0f172a',
      border: '#cbd5e1',
      mainAreaBg: '#0f172a',
      mainAreaBgAccent: '#1e293b',
      mainAreaText: '#ffffff',
      supportiveText: '#64748b',
    },
  },
  dark: {
    colors: {
      accent: '#8b6dff',
      accentText: '#ffffff',
      background: '#1a1a1a',
      backgroundAccent: '#242424',
      baseText: '#f1f5f9',
      border: '#333333',
      mainAreaBg: '#0b0f19',
      mainAreaBgAccent: '#1a1a1a',
      mainAreaText: '#ffffff',
      supportiveText: '#94a3b8',
    },
  },
};

interface Props {
  session: TeleconsultSession;
  onLeft: () => void;
  onCall?: (call: DailyCall | null) => void;
}

export const TeleconsultRoom: React.FC<Props> = ({ session, onLeft, onCall }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLeftRef = useRef(onLeft);
  const onCallRef = useRef(onCall);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onLeftRef.current = onLeft;
    onCallRef.current = onCall;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let call: DailyCall | null = null;

    (async () => {
      // StrictMode monta duas vezes: o Daily não aceita dois frames ao mesmo tempo.
      await DailyIframe.getCallInstance()?.destroy();
      if (cancelled) return;
      call = DailyIframe.createFrame(container, {
        showLeaveButton: true,
        showFullscreenButton: true,
        lang: 'pt-BR',
        theme: THEME,
        iframeStyle: { width: '100%', height: '100%', border: '0' },
      });
      call.on('left-meeting', () => onLeftRef.current());
      call.on('joined-meeting', () => setJoining(false));
      call.on('error', (ev) => setError(ev?.errorMsg || 'A chamada caiu.'));
      onCallRef.current?.(call);
      try {
        await call.join({ url: session.room_url, token: session.token });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Não foi possível conectar à sala.');
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
      onCallRef.current?.(null);
      call?.destroy();
    };
  }, [session.room_url, session.token]);

  return (
    <div className="relative h-full w-full bg-slate-900">
      <div ref={containerRef} className="h-full w-full" />
      {joining && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-300">
          <span className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Conectando à sala…
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-x-4 top-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
};
