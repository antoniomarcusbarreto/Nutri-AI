import React from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Percent, Users, Utensils } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ClinicStats, MonthActivity } from '../../hooks/queries/useDashboard';
import { cn } from '../../lib/cn';
import { Card } from '../ui';
import { LoadError } from './dashboardUi';

/** Diferença absoluta contra o mês anterior ("+3 vs. set."). */
const Delta: React.FC<{ current: number; previous: number; prevLabel: string; unit?: string }> = ({ current, previous, prevLabel, unit = '' }) => {
  if (current === 0 && previous === 0) return null;
  const diff = current - previous;
  if (diff === 0) return <p>igual a {prevLabel}</p>;
  return (
    <p className={diff > 0 ? 'text-emerald-700' : 'text-rose-700'}>
      {diff > 0 ? '+' : '−'}{Math.abs(diff)}{unit} vs. {prevLabel}
    </p>
  );
};

const Tile: React.FC<{
  label: string;
  icon: React.ElementType;
  value?: string;
  /** Valor zerado/sem base: cinza, para o azul de destaque marcar só número real. */
  empty?: boolean;
  loading: boolean;
  children?: React.ReactNode;
}> = ({ label, icon: Icon, value, empty, loading, children }) => (
  <Card padding="sm" className="flex flex-col gap-1">
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
    {loading ? (
      <>
        <span className="h-9 w-20 rounded-lg bg-slate-200 animate-pulse" aria-hidden="true" />
        <span className="h-4 w-28 rounded bg-slate-200 animate-pulse" aria-hidden="true" />
        <span className="sr-only">Carregando</span>
      </>
    ) : (
      <>
        <p className={cn('text-3xl font-semibold tabular-nums', empty ? 'text-slate-400' : 'text-[#5024fc]')}>{value}</p>
        <div className="space-y-0.5 text-xs text-slate-500">{children}</div>
      </>
    )}
  </Card>
);

/** Comparecimento em % (concluídas ÷ passadas); null sem base. */
const attendance = (m?: MonthActivity) => (m && m.pastHeld > 0 ? Math.round((m.concluded / m.pastHeld) * 100) : null);

export interface MonthResultsProps {
  query: UseQueryResult<ClinicStats>;
  month: Date;
  onMonthChange: (d: Date) => void;
  isSecretary: boolean;
}

export const MonthResults: React.FC<MonthResultsProps> = ({ query, month, onMonthChange, isSecretary }) => {
  const stats = query.data;
  const cur = stats?.current;
  const prev = stats?.previous;
  const loading = query.isPending;

  const monthName = month.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  const prevLabel = new Date(month.getFullYear(), month.getMonth() - 1, 1)
    .toLocaleString('pt-BR', { month: 'short' }).replace('.', '') + '.';
  const shift = (delta: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  const att = attendance(cur);
  const prevAtt = attendance(prev);
  const missed = cur ? cur.pastHeld - cur.concluded : 0;

  return (
    <section aria-labelledby="month-results-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="month-results-title" className="text-lg font-semibold text-slate-900">Resultados do mês</h2>
        <div className="flex items-center gap-1 self-start rounded-2xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm sm:self-auto">
          <button type="button" onClick={() => shift(-1)} aria-label="Mês anterior" className="rounded-xl p-1.5 text-slate-500 transition-colors hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span aria-live="polite" className="min-w-[150px] text-center text-sm font-medium text-slate-900 first-letter:uppercase">
            {monthName}
          </span>
          <button type="button" onClick={() => shift(1)} aria-label="Próximo mês" className="rounded-xl p-1.5 text-slate-500 transition-colors hover:bg-slate-100">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {query.isError ? (
        <LoadError message="Não foi possível carregar os números do mês." onRetry={() => query.refetch()} />
      ) : (
        <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', isSecretary ? 'lg:grid-cols-3' : 'xl:grid-cols-4')}>
          <Tile label="Consultas" icon={CalendarCheck} value={String(cur?.appointments ?? 0)} empty={!cur?.appointments} loading={loading}>
            {cur && prev && <Delta current={cur.appointments} previous={prev.appointments} prevLabel={prevLabel} />}
            <p>{cur?.attendedHours ?? 0}h atendidas · sem canceladas</p>
          </Tile>
          <Tile label="Comparecimento" icon={Percent} value={att === null ? '—' : `${att}%`} empty={att === null} loading={loading}>
            {att !== null && prevAtt !== null && <Delta current={att} previous={prevAtt} prevLabel={prevLabel} unit=" p.p." />}
            <p>
              {cur && cur.pastHeld > 0
                ? `${cur.concluded} de ${cur.pastHeld} concluídas${missed > 0 ? ` · ${missed} falta${missed > 1 ? 's' : ''} ou sem registro` : ''}`
                : 'Sem consultas passadas no mês'}
            </p>
          </Tile>
          {!isSecretary && (
            <Tile label="Planos alimentares" icon={Utensils} value={String(cur?.mealPlans ?? 0)} empty={!cur?.mealPlans} loading={loading}>
              {cur && prev && <Delta current={cur.mealPlans ?? 0} previous={prev.mealPlans ?? 0} prevLabel={prevLabel} />}
              <p>Criados no mês</p>
            </Tile>
          )}
          <Tile label="Pacientes ativos" icon={Users} value={String(stats?.patientsCount ?? 0)} empty={!stats?.patientsCount} loading={loading}>
            <p>{isSecretary ? 'Total da clínica, hoje' : 'Seus pacientes, hoje'}</p>
          </Tile>
        </div>
      )}
    </section>
  );
};
