import React from 'react';
import { Salad } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import type { MealPlanRecord } from '../../types/clinical';
import { SectionHeader } from './chartKit';
import { DOMAIN } from './trackingTheme';
import { fmtDelta, fmtShortDate, type PlanEffect } from './trackingModel';

const Delta: React.FC<{ value: number | null; unit: string; direction: -1 | 0 | 1 }> = ({ value, unit, direction }) => {
  if (value == null) return <span className="text-slate-400" title="Medições insuficientes durante o plano">—</span>;
  const tone = direction === 0 || Math.abs(value) < 0.05
    ? 'text-slate-700'
    : Math.sign(value) === direction ? 'text-emerald-700' : 'text-rose-700';
  return <span className={cn('font-medium tabular-nums', tone)}>{fmtDelta(value)}{unit}</span>;
};

export interface PlanEffectTableProps {
  effects: PlanEffect[];
  weightDirection: -1 | 0 | 1;
  periodText: string;
  onOpenPlan: (plan: MealPlanRecord) => void;
}

/**
 * Quanto cada métrica mudou durante a vigência de cada plano alimentar — o
 * que antes só se via cruzando as linhas tracejadas do gráfico com os pontos.
 */
export const PlanEffectTable: React.FC<PlanEffectTableProps> = ({ effects, weightDirection, periodText, onOpenPlan }) => (
  <Card as="section" aria-labelledby="plan-effect-title" className="space-y-4">
    <SectionHeader
      id="plan-effect-title"
      icon={<Salad />}
      plate={DOMAIN.mealplan.dot}
      title="Efeito de cada plano alimentar"
      subtitle={`Variação entre a medição de início e a última medição de cada plano, ${periodText}`}
    />
    {effects.length === 0 ? (
      <p className="text-sm text-slate-500">Nenhum plano alimentar {periodText}.</p>
    ) : (
      <>
        <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Plano</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Vigência</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Medições</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Peso</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Gordura</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Músculo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {effects.map((e) => (
                <tr key={e.plan.id}>
                  <th scope="row" className="px-4 py-2.5 font-normal">
                    <button
                      type="button"
                      onClick={() => onOpenPlan(e.plan)}
                      className="font-medium text-amber-800 underline decoration-amber-300 underline-offset-2 hover:decoration-amber-600 cursor-pointer"
                    >
                      {e.plan.kcal} kcal
                    </button>
                    {e.current && <span className="ml-2 rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">Atual</span>}
                  </th>
                  <td className="px-4 py-2.5 text-slate-600">
                    {fmtShortDate(e.start)} – {e.current ? 'hoje' : fmtShortDate(e.end)}
                    <span className="block text-xs text-slate-500">{e.days} dia{e.days === 1 ? '' : 's'}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-600">{e.measurements}</td>
                  <td className="px-4 py-2.5"><Delta value={e.weight} unit=" kg" direction={weightDirection} /></td>
                  <td className="px-4 py-2.5"><Delta value={e.bodyFat} unit=" p.p." direction={-1} /></td>
                  <td className="px-4 py-2.5"><Delta value={e.muscleMass} unit=" p.p." direction={1} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          "—" = medições insuficientes durante o plano. Verde: mudou na direção esperada; vermelho: na direção oposta
          {weightDirection === 0 ? ' (o peso fica neutro porque o objetivo do paciente não indica perda nem ganho)' : ''}.
        </p>
      </>
    )}
  </Card>
);
