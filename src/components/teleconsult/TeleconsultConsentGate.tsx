import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../ui';
import { decideConsent } from '../../lib/teleconsult';
import {
  TELECONSULT_TERMS_INTRO, TELECONSULT_TERMS_ITEMS, TELECONSULT_TERMS_TITLE, TELECONSULT_TERMS_VERSION,
} from '../../lib/teleconsultTerms';

/**
 * Portal: antes de entrar na teleconsulta, o paciente decide sobre a
 * transcrição (migration 0044). As duas respostas ficam registradas com a
 * versão do termo; recusar não impede a consulta.
 */
interface Props {
  appointmentId: string;
  nutritionistName?: string | null;
  onDecided: () => void;
}

export const TeleconsultConsentGate: React.FC<Props> = ({ appointmentId, nutritionistName, onDecided }) => {
  const [busy, setBusy] = useState<'aceito' | 'recusado' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'aceito' | 'recusado') => {
    setBusy(decision);
    setError(null);
    try {
      await decideConsent(appointmentId, decision, TELECONSULT_TERMS_VERSION);
      onDecided();
    } catch (err) {
      setError((err as { message?: string })?.message || 'Não foi possível registrar sua resposta. Tente de novo.');
      setBusy(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-8">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">{TELECONSULT_TERMS_TITLE}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          {nutritionistName ? `${nutritionistName} gostaria de transcrever esta consulta. ` : ''}
          {TELECONSULT_TERMS_INTRO}
        </p>

        <dl className="mt-6 space-y-4 border-t border-slate-100 pt-5">
          {TELECONSULT_TERMS_ITEMS.map((item) => (
            <div key={item.title}>
              <dt className="text-sm font-semibold text-slate-900">{item.title}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{item.text}</dd>
            </div>
          ))}
        </dl>

        {error && <p role="alert" className="mt-5 text-sm text-rose-600">{error}</p>}

        <div className="mt-7 flex flex-col gap-2 sm:flex-row-reverse">
          <Button className="h-11 sm:flex-1" loading={busy === 'aceito'} disabled={!!busy} onClick={() => decide('aceito')}>
            Aceito a transcrição
          </Button>
          <Button variant="secondary" className="h-11 sm:flex-1" loading={busy === 'recusado'} disabled={!!busy} onClick={() => decide('recusado')}>
            Entrar sem transcrição
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Versão do termo: {TELECONSULT_TERMS_VERSION}</p>
      </div>
    </div>
  );
};
