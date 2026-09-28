import React from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Sparkles, Target } from 'lucide-react';
import { Card } from '../ui';
import type { ExamRecord, MealPlanRecord } from '../../types/clinical';
import { examDate, fmtDate } from './trackingModel';

export interface PredictionCardProps {
  latestExam: ExamRecord | null;
  mealPlans: MealPlanRecord[];
  now: Date;
}

/**
 * Projeção da IA a partir do último laudo. Mostra SÓ o que a IA devolveu —
 * a versão anterior inventava prazos ("Hashimoto → 16 semanas") e focos
 * genéricos quando o campo vinha vazio, e reescrevia o texto da IA com regex.
 * Sem dado da IA, o card simplesmente não aparece.
 */
export const PredictionCard: React.FC<PredictionCardProps> = ({ latestExam, mealPlans, now }) => {
  const fb = latestExam?.ai_feedback;
  const weeks = fb?.tempo_estimado || fb?.base_weeks || null;
  const focus = fb?.focos_sugeridos?.filter(Boolean) ?? [];
  const description = fb?.analise_preditiva?.trim();
  if (!latestExam || (!description && !weeks && focus.length === 0)) return null;

  // Início do tratamento = primeiro plano alimentar.
  const firstPlan = mealPlans.length
    ? mealPlans.reduce((a, b) => (new Date(a.created_at) < new Date(b.created_at) ? a : b))
    : null;
  const currentWeek = firstPlan
    ? Math.floor(Math.max(0, differenceInCalendarDays(now, new Date(firstPlan.created_at))) / 7) + 1
    : null;

  return (
    <Card as="section" aria-labelledby="prediction-title" className="space-y-4 border-indigo-100 bg-indigo-50">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-indigo-600 text-white shadow-md" aria-hidden="true">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 id="prediction-title" className="text-base font-semibold text-slate-900">Projeção da IA</h2>
              <p className="mt-0.5 text-sm text-slate-500">Com base no laudo de {fmtDate(examDate(latestExam))}</p>
            </div>
          </div>
        </div>
        {weeks && (
          <div className="w-full rounded-2xl border border-indigo-100 bg-white px-4 py-3 shadow-sm sm:w-64">
            <p className="text-xs font-medium text-slate-500">
              {currentWeek ? 'Tempo de tratamento' : 'Duração estimada'}
            </p>
            <p className="mt-1 text-lg font-medium text-slate-900 tabular-nums">
              {currentWeek ? <>Semana {currentWeek} <span className="text-sm font-normal text-slate-500">de {weeks} estimadas</span></> : `${weeks} semanas`}
            </p>
            {currentWeek && currentWeek > weeks ? (
              <p className="text-xs text-amber-700">Passou da duração estimada; vale reavaliar com um novo exame.</p>
            ) : currentWeek ? (
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={weeks}
                aria-valuenow={Math.min(currentWeek, weeks)}
                aria-label="Progresso do tratamento"
              >
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#14b8a6,#5024fc)]" style={{ width: `${Math.min(100, (currentWeek / weeks) * 100)}%` }} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Começa a contar no primeiro plano alimentar</p>
            )}
          </div>
        )}
      </header>

      {description && <p className="max-w-3xl text-sm leading-relaxed text-slate-700">{description}</p>}

      {focus.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-600">Focos sugeridos</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {focus.map((f) => (
              <li key={f} className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-700">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />{f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">Estimativa gerada pela IA a partir do laudo. Apoio à decisão; não substitui o julgamento clínico.</p>
    </Card>
  );
};
