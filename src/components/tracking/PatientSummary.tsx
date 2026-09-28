import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, CalendarClock, CalendarPlus, FileUp, FlaskConical, Salad, Stethoscope } from 'lucide-react';
import { Button, Card } from '../ui';
import { cn } from '../../lib/cn';
import type { MealPlanRecord, PatientRow } from '../../types/clinical';
import { daysAgoLabel, fmtDate, type FlowStats } from './trackingModel';
import { DOMAIN } from './trackingTheme';

/** Sem retorno agendado e última consulta há mais que isso → alerta. */
const RETURN_ALERT_DAYS = 60;

export interface PatientSummaryProps {
  patient: PatientRow;
  age: number | null;
  stats: FlowStats;
  latestPlan: MealPlanRecord | null;
  latestExamDate: Date | null;
  onOpenPlan: (plan: MealPlanRecord) => void;
}

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

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();

/**
 * Cabeçalho de contexto do paciente: quem é, onde está no acompanhamento e
 * atalhos para as ações mais comuns depois de revisar a evolução.
 */
export const PatientSummary: React.FC<PatientSummaryProps> = ({ patient, age, stats, latestPlan, latestExamDate, onOpenPlan }) => {
  const navigate = useNavigate();
  const returnOverdue = !stats.next && stats.daysSinceLastDone != null && stats.daysSinceLastDone > RETURN_ALERT_DAYS;
  const demographics = [
    age != null ? `${age} anos` : null,
    patient.biological_sex === 'F' ? 'Feminino' : patient.biological_sex === 'M' ? 'Masculino' : null,
    patient.main_goal ? `Objetivo: ${patient.main_goal}` : null,
  ].filter(Boolean);

  return (
    <Card as="section" aria-label="Resumo do paciente" padding="sm" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-base font-semibold text-white shadow-md" aria-hidden="true">
            {initials(patient.name)}
          </span>
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-slate-900">{patient.name}</h2>
            {patient.status !== 'ativo' && (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Inativo</span>
            )}
          </div>
          {demographics.length > 0 && <p className="mt-0.5 text-sm text-slate-500">{demographics.join(' · ')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => navigate('/agenda')}>
            Agendar retorno
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<FileUp className="h-4 w-4" />} onClick={() => navigate('/exames')}>
            Anexar exame
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Salad className="h-4 w-4" />} onClick={() => navigate('/planos')}>
            Plano alimentar
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={<Stethoscope />}
          plate={DOMAIN.consultation.plate}
          label="Última consulta"
          value={stats.lastDone ? fmtDate(stats.lastDone) : 'Nenhuma'}
          hint={stats.lastDone ? daysAgoLabel(stats.lastDone) : undefined}
        />
        <Fact
          icon={returnOverdue ? <AlertTriangle /> : <CalendarClock />}
          plate={DOMAIN.consultation.plate}
          label="Próximo retorno"
          warn={returnOverdue}
          value={stats.next ? format(new Date(stats.next.date_time), "dd/MM/yyyy 'às' HH:mm") : 'Não agendado'}
          hint={stats.next
            ? daysAgoLabel(new Date(stats.next.date_time))
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
          hint={latestExamDate ? daysAgoLabel(latestExamDate) : undefined}
        />
      </dl>
    </Card>
  );
};
