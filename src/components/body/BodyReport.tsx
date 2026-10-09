import React from 'react';
import { computeBody, PERIMETERS, toInputKey, type BodyInputs, type Indicator, type Tone } from '../../lib/bodyComposition';
import { cn } from '../../lib/cn';

/**
 * Relatório de composição corporal: massas, indicadores com faixa de risco,
 * perímetros e um índice geral. Usado pelo nutricionista (revisão) e pelo
 * paciente (só avaliações validadas e compartilhadas).
 */

const TONE: Record<Tone, { chip: string; bar: string }> = {
  good: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', bar: 'bg-emerald-400' },
  warn: { chip: 'bg-amber-50 text-amber-800 ring-amber-200', bar: 'bg-amber-400' },
  bad: { chip: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-400' },
  neutral: { chip: 'bg-slate-100 text-slate-600 ring-slate-200', bar: 'bg-slate-300' },
};

const fmt = (v: number, d: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const BandBar: React.FC<{ ind: Indicator }> = ({ ind }) => {
  if (!ind.bands) return null;
  return (
    <div className="mt-2 flex gap-0.5" aria-hidden="true">
      {ind.bands.map((b) => (
        <div key={b.label} className="flex-1">
          <div className={cn('h-1.5 rounded-full', b === ind.band ? TONE[b.tone].bar : 'bg-slate-200')} />
          <p className={cn('mt-1 truncate text-[10px]', b === ind.band ? 'font-semibold text-slate-700' : 'text-slate-400')}>{b.label}</p>
        </div>
      ))}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
  </div>
);

export interface BodyReportProps {
  inputs: BodyInputs;
  /** Avaliação anterior, para mostrar a variação. */
  previous?: BodyInputs | null;
  /** Mostra o aviso de estimativa (fotos/IA). */
  estimated?: boolean;
}

export const BodyReport: React.FC<BodyReportProps> = ({ inputs, previous, estimated }) => {
  const r = computeBody(inputs);
  const p = previous ? computeBody(previous) : null;

  const delta = (now: number | null, before: number | null | undefined, unit: string, d = 1) => {
    if (now == null || before == null) return undefined;
    const diff = now - before;
    if (Math.abs(diff) < 10 ** -d / 2) return 'igual à anterior';
    return `${diff > 0 ? '+' : ''}${fmt(diff, d)} ${unit} vs anterior`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Peso" value={`${fmt(inputs.weightKg, 1)} kg`} sub={delta(inputs.weightKg, previous?.weightKg, 'kg')} />
        {r.fatMassKg != null && (
          <Stat label="Massa gorda" value={`${fmt(r.fatMassKg, 1)} kg`} sub={delta(r.fatMassKg, p?.fatMassKg, 'kg')} />
        )}
        {r.leanMassKg != null && (
          <Stat label="Massa magra" value={`${fmt(r.leanMassKg, 1)} kg`} sub={delta(r.leanMassKg, p?.leanMassKg, 'kg')} />
        )}
        {r.waterL != null && <Stat label="Água corporal (estimada)" value={`${fmt(r.waterL, 1)} L`} />}
        {r.restingKcal != null && <Stat label="Gasto de repouso" value={`${fmt(r.restingKcal, 0)} kcal`} sub="Cunningham" />}
        {r.score != null && <Stat label="Índice geral" value={`${r.score}/100`} sub="Quanto maior, melhor" />}
      </div>

      {r.fatSource === 'rfm' && (
        <p className="text-xs text-slate-500">% de gordura estimado pela fórmula RFM (cintura e altura).</p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {r.indicators.map((ind) => (
          <li key={ind.key} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">{ind.label}</p>
              {ind.band && (
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', TONE[ind.band.tone].chip)}>
                  {ind.band.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {fmt(ind.value, ind.decimals)}
              {ind.unit && <span className="ml-1 text-sm font-normal text-slate-500">{ind.unit}</span>}
            </p>
            <BandBar ind={ind} />
            {ind.hint && <p className="mt-2 text-[11px] text-slate-500">{ind.hint}</p>}
          </li>
        ))}
      </ul>

      {PERIMETERS.some((m) => inputs[toInputKey(m.key)] != null) && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Perímetros</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PERIMETERS.map((m) => {
              const v = inputs[toInputKey(m.key)] as number | null | undefined;
              if (v == null) return null;
              const before = previous?.[toInputKey(m.key)] as number | null | undefined;
              return <Stat key={m.key} label={m.label} value={`${fmt(v, 1)} cm`} sub={delta(v, before, 'cm')} />;
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500">
        {estimated
          ? 'Valores estimados a partir de fotos e medidas informadas. Não têm poder diagnóstico e devem ser interpretados pelo nutricionista junto com a história clínica.'
          : 'Indicadores de apoio à avaliação clínica. A interpretação é do nutricionista.'}
      </p>
    </div>
  );
};
