import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useSetupProgress, type SetupProgress } from '../../hooks/queries/useDashboard';
import { cn } from '../../lib/cn';
import { Card } from '../ui';

const STEPS: { key: keyof SetupProgress; title: string; hint: string; to: string; cta: string }[] = [
  { key: 'services', title: 'Cadastre seus serviços', hint: 'Consulta, retorno, avaliação — com duração e preço.', to: '/servicos', cta: 'Cadastrar serviço' },
  { key: 'patients', title: 'Adicione o primeiro paciente', hint: 'Ele recebe por link a ficha de saúde para preencher.', to: '/pacientes?novo=1', cta: 'Novo paciente' },
  { key: 'appointments', title: 'Marque a primeira consulta', hint: 'A cobrança nasce junto com o agendamento.', to: '/agenda?novo=1', cta: 'Novo agendamento' },
  { key: 'mealPlans', title: 'Monte o primeiro plano alimentar', hint: 'Compartilhe com o paciente por link ou PDF.', to: '/planos', cta: 'Criar plano' },
];

const storageKey = (clinicId: string) => `nutriai:setup-dismissed:${clinicId}`;

const readDismissed = (clinicId?: string) => {
  if (!clinicId) return false;
  try {
    return localStorage.getItem(storageKey(clinicId)) === '1';
  } catch {
    return false;
  }
};

/** Primeiros passos de uma conta nova (só o dono). Some quando tudo foi feito ou ao dispensar. */
export const SetupChecklist: React.FC<{ clinicId?: string; enabled: boolean }> = ({ clinicId, enabled }) => {
  const [dismissed, setDismissed] = useState(() => readDismissed(clinicId));
  const { data } = useSetupProgress(clinicId, enabled && !dismissed);

  if (!enabled || dismissed || !data) return null;
  const done = STEPS.filter((s) => data[s.key]).length;
  if (done === STEPS.length) return null;
  const next = STEPS.find((s) => !data[s.key]);

  const dismiss = () => {
    try {
      if (clinicId) localStorage.setItem(storageKey(clinicId), '1');
    } catch { /* sem storage: some só nesta sessão */ }
    setDismissed(true);
  };

  return (
    <Card as="section" aria-labelledby="setup-title" className="border-primary-100">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="setup-title" className="text-lg font-semibold text-slate-900">Primeiros passos</h2>
          <p className="text-xs text-slate-500">{done} de {STEPS.length} concluídos · deixe o consultório pronto para o primeiro atendimento</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dispensar primeiros passos" className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} aria-label="Progresso dos primeiros passos">
        <div className="h-full rounded-full bg-primary-500 transition-[width] duration-500" style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>
      <ol className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => {
          const ok = data[s.key];
          const isNext = s.key === next?.key;
          return (
            <li key={s.key} className={cn('flex flex-col rounded-2xl border bg-white p-3.5', isNext ? 'border-primary-300' : 'border-slate-200')}>
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  ok ? 'bg-emerald-600 text-white' : isNext ? 'bg-primary-50 text-primary-700' : 'bg-slate-100 text-slate-500',
                )}>
                  {ok ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                </span>
                <p className={cn('text-sm font-medium', ok ? 'text-slate-500 line-through' : 'text-slate-900')}>{s.title}</p>
              </div>
              {!ok && (
                <>
                  <p className="mt-1.5 flex-1 pl-[34px] text-xs text-slate-500">{s.hint}</p>
                  <Link
                    to={s.to}
                    className={cn(
                      'mt-3 ml-[34px] self-start rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
                      isNext ? 'bg-[#5024fc] text-white shadow-sm hover:bg-[#431cdb]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    )}
                  >
                    {s.cta}
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
};
