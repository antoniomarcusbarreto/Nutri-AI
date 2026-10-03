import React from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CalendarClock, FileText, FlaskConical, Salad, Stethoscope } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import type { AppointmentRecord, ExamRecord, MealPlanRecord, PatientRow } from '../../types/clinical';
import { pickOne } from '../../types/clinical';
import { AttentionPanel } from './AttentionPanel';
import { ClinicalProfileCard } from './ClinicalProfileCard';
import { ExamInsightCard } from './ExamInsightCard';
import { ProgressCard } from './ProgressCard';
import { DOMAIN } from './trackingTheme';
import {
  daysAgoLabel,
  examDate,
  fmtDate,
  isReturnOverdue,
  type AttentionItem,
  type AttentionTarget,
  type FlowStats,
  type Progress,
} from './trackingModel';

const Fact: React.FC<{ icon: React.ReactNode; plate: string; label: string; value: React.ReactNode; hint?: React.ReactNode; warn?: boolean }> = ({ icon, plate, label, value, hint, warn }) => (
  <div className={cn('flex min-w-0 items-start gap-3 rounded-2xl border px-3 py-2.5', warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border [&>svg]:h-4.5 [&>svg]:w-4.5', warn ? DOMAIN.mealplan.plate : plate)} aria-hidden="true">
      {icon}
    </span>
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={cn('mt-0.5 truncate text-sm font-medium', warn ? 'text-amber-800' : 'text-slate-900')}>{value}</dd>
      {hint && <dd className={cn('text-xs', warn ? 'text-amber-700' : 'text-slate-500')}>{hint}</dd>}
    </div>
  </div>
);

export interface OverviewTabProps {
  patient: PatientRow;
  stats: FlowStats;
  attention: AttentionItem[];
  progress: Progress;
  weightDirection: -1 | 0 | 1;
  latestPlan: MealPlanRecord | null;
  latestExam: ExamRecord | null;
  /** Último atendimento realizado com registro de consulta. */
  lastVisit: AppointmentRecord | null;
  now: Date;
  onAttention: (target: AttentionTarget) => void;
  onOpenPlan: (plan: MealPlanRecord) => void;
  onOpenExam: (exam: ExamRecord) => void;
  onOpenAppointment: (apt: AppointmentRecord) => void;
}

/**
 * Visão geral: responde "como este paciente está?" sem rolar a página.
 * É sempre o retrato atual — o período só recorta as outras abas.
 */
export const OverviewTab: React.FC<OverviewTabProps> = ({
  patient, stats, attention, progress, weightDirection, latestPlan, latestExam, lastVisit, now,
  onAttention, onOpenPlan, onOpenExam, onOpenAppointment,
}) => {
  const returnOverdue = isReturnOverdue(stats);
  const latestExamDate = latestExam ? examDate(latestExam) : null;
  const notes = pickOne(lastVisit?.consultations)?.anamnese_notes?.trim();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <AttentionPanel items={attention} onAction={onAttention} />

        <section aria-label="Situação atual">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Fact
              icon={<Stethoscope />}
              plate={DOMAIN.consultation.plate}
              label="Última consulta"
              value={stats.lastDone ? fmtDate(stats.lastDone) : 'Nenhuma'}
              hint={stats.lastDone ? daysAgoLabel(stats.lastDone, now) : undefined}
            />
            <Fact
              icon={returnOverdue ? <AlertTriangle /> : <CalendarClock />}
              plate={DOMAIN.consultation.plate}
              label="Próximo retorno"
              warn={returnOverdue}
              value={stats.next ? format(new Date(stats.next.date_time), "dd/MM/yyyy 'às' HH:mm") : 'Não agendado'}
              hint={stats.next
                ? daysAgoLabel(new Date(stats.next.date_time), now)
                : returnOverdue
                  ? `${stats.daysSinceLastDone} dias sem consulta`
                  : undefined}
            />
            <Fact
              icon={<Salad />}
              plate={DOMAIN.mealplan.plate}
              label="Plano alimentar atual"
              value={latestPlan ? (
                <button type="button" onClick={() => onOpenPlan(latestPlan)} className="text-amber-800 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-600 cursor-pointer">
                  {latestPlan.kcal} kcal
                </button>
              ) : 'Nenhum plano'}
              hint={latestPlan ? `desde ${fmtDate(new Date(latestPlan.created_at))}` : undefined}
            />
            <Fact
              icon={<FlaskConical />}
              plate={DOMAIN.exam.plate}
              label="Último exame"
              value={latestExamDate ? fmtDate(latestExamDate) : 'Nenhum'}
              hint={latestExamDate ? daysAgoLabel(latestExamDate, now) : undefined}
            />
          </dl>
        </section>

        <ProgressCard progress={progress} weightDirection={weightDirection} now={now} onOpenBody={() => onAttention({ tab: 'corpo' })} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <ClinicalProfileCard patient={patient} />

        {lastVisit && (
          <Card as="section" aria-labelledby="last-visit-title" padding="sm" className="space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="last-visit-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-teal-600" aria-hidden="true" />
                Anotação da última consulta
              </h2>
              <span className="text-xs text-slate-500">{fmtDate(new Date(lastVisit.date_time))}</span>
            </header>
            <p className={cn('whitespace-pre-line text-sm leading-relaxed line-clamp-4', notes ? 'text-slate-700' : 'text-slate-400')}>
              {notes || 'Nenhuma anotação de anamnese registrada.'}
            </p>
            <button
              type="button"
              onClick={() => onOpenAppointment(lastVisit)}
              className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:brightness-95 cursor-pointer"
            >
              Ver atendimento
            </button>
          </Card>
        )}

        <ExamInsightCard exam={latestExam} compact onOpenExam={onOpenExam} />
      </div>
    </div>
  );
};
