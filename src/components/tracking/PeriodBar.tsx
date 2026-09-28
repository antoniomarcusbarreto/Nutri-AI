import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/cn';
import type { Period } from './trackingModel';

const PRESETS: { label: string; period: Period }[] = [
  { label: '3 meses', period: { kind: 'recent', months: 3 } },
  { label: '6 meses', period: { kind: 'recent', months: 6 } },
  { label: '12 meses', period: { kind: 'recent', months: 12 } },
  { label: 'Tudo', period: { kind: 'all' } },
];

const isSamePreset = (a: Period, b: Period) =>
  a.kind === 'recent' ? b.kind === 'recent' && a.months === b.months : a.kind === b.kind;

export interface PeriodBarProps {
  period: Period;
  onChange: (p: Period) => void;
  /** Anos com algum registro do paciente (mais o atual), em ordem decrescente. */
  years: number[];
}

/**
 * Recorte temporal único da página: atalhos (3/6/12 meses, tudo), navegação
 * mês a mês e seleção de ano. Todas as seções abaixo leem o mesmo período.
 */
export const PeriodBar: React.FC<PeriodBarProps> = ({ period, onChange, years }) => {
  const now = new Date();
  // Mês exibido no navegador: o do período quando for mensal; senão, o atual.
  const navYear = period.kind === 'month' ? period.year : now.getFullYear();
  const navMonth = period.kind === 'month' ? period.month : now.getMonth();

  const shiftMonth = (delta: number) => {
    const d = new Date(navYear, navMonth + delta, 1);
    onChange({ kind: 'month', year: d.getFullYear(), month: d.getMonth() });
  };

  const segment = (active: boolean) =>
    cn(
      'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap',
      active ? 'bg-[#5024fc] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    );

  return (
    <div
      role="toolbar"
      aria-label="Período de análise"
      className="flex flex-wrap items-center gap-2 sm:gap-3"
    >
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Atalhos de período">
        {PRESETS.map(({ label, period: p }) => {
          const active = isSamePreset(period, p);
          return (
            <button key={label} type="button" aria-pressed={active} className={segment(active)} onClick={() => onChange(p)}>
              {label}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          'inline-flex items-center rounded-xl border p-0.5',
          period.kind === 'month' ? 'border-[#5024fc] bg-[#5024fc] [&_button]:text-white [&_button:hover]:bg-white/15' : 'border-slate-200 bg-white',
        )}
        role="group"
        aria-label="Navegar por mês"
      >
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Mês anterior"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChange({ kind: 'month', year: navYear, month: navMonth })}
          aria-pressed={period.kind === 'month'}
          className={cn(
            'min-w-[8.5rem] px-2 py-1 text-xs font-medium capitalize rounded-lg cursor-pointer',
            period.kind === 'month' ? 'text-white' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          {format(new Date(navYear, navMonth, 1), 'MMMM yyyy', { locale: ptBR })}
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Próximo mês"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-slate-500">
        <span className="sr-only sm:not-sr-only">Ano</span>
        <select
          aria-label="Ano"
          value={period.kind === 'year' ? String(period.year) : ''}
          onChange={(e) => e.target.value && onChange({ kind: 'year', year: Number(e.target.value) })}
          className={cn(
            'rounded-xl border bg-white px-2.5 py-1.5 text-xs font-medium cursor-pointer',
            period.kind === 'year' ? 'border-[#5024fc] text-[#5024fc] ring-1 ring-[#5024fc]' : 'border-slate-200 text-slate-600',
          )}
        >
          <option value="">Ano inteiro…</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
    </div>
  );
};
