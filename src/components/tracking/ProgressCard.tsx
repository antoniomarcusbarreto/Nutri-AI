import React from 'react';
import { formatDistanceStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Milestone } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import { SectionHeader, Sparkline } from './chartKit';
import { SERIES } from './chartConfig';
import { DOMAIN } from './trackingTheme';
import { fmtDate, fmtDelta, fmtNumber, fmtShortDate, type MetricChange, type Progress } from './trackingModel';

/** Cor da variação: só verde/vermelho quando se sabe a direção desejada. */
const deltaTone = (delta: number, direction: -1 | 0 | 1) =>
  direction === 0 || Math.abs(delta) < 0.05
    ? 'text-slate-700'
    : Math.sign(delta) === direction ? 'text-emerald-700' : 'text-rose-700';

const ChangeRow: React.FC<{ label: string; unit: string; change: MetricChange | null; direction: -1 | 0 | 1; pctOfStart?: boolean }> = ({
  label, unit, change, direction, pctOfStart,
}) => {
  if (!change) {
    return (
      <div className="flex items-baseline justify-between gap-3 py-2">
        <dt className="text-sm text-slate-600">{label}</dt>
        <dd className="text-xs text-slate-400">Precisa de 2 medições</dd>
      </div>
    );
  }
  const Icon = change.delta > 0 ? ArrowUpRight : change.delta < 0 ? ArrowDownRight : ArrowRight;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="flex items-baseline gap-2 tabular-nums">
        <span className="text-xs text-slate-500">{fmtNumber(change.first)} → {fmtNumber(change.last)}{unit}</span>
        <span className={cn('inline-flex items-center gap-0.5 text-sm font-semibold', deltaTone(change.delta, direction))}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {fmtDelta(change.delta)}{unit === '%' ? ' p.p.' : unit}
          {pctOfStart && change.first > 0 && (
            <span className="font-normal text-slate-500">({fmtDelta((change.delta / change.first) * 100)}%)</span>
          )}
        </span>
      </dd>
    </div>
  );
};

export interface ProgressCardProps {
  progress: Progress;
  /** Direção desejada do peso (-1 perder, +1 ganhar, 0 sem objetivo claro). */
  weightDirection: -1 | 0 | 1;
  now: Date;
  onOpenBody: () => void;
}

/** Evolução desde a primeira consulta, independente do período selecionado. */
export const ProgressCard: React.FC<ProgressCardProps> = ({ progress, weightDirection, now, onOpenBody }) => {
  const { start, doneCount, weight, bodyFat, muscleMass, weightTrail } = progress;
  return (
    <Card as="section" aria-labelledby="progress-title" className="space-y-4">
      <SectionHeader
        id="progress-title"
        icon={<Milestone />}
        plate={DOMAIN.metrics.dot}
        title="Progresso desde o início"
        subtitle={start
          ? <>Acompanhamento desde {fmtDate(start)} · {formatDistanceStrict(start, now, { locale: ptBR })} · {doneCount} consulta{doneCount === 1 ? '' : 's'} realizada{doneCount === 1 ? '' : 's'}</>
          : 'Nenhuma consulta realizada ainda'}
        actions={
          <button type="button" onClick={onOpenBody} className="inline-flex items-center gap-0.5 text-xs font-medium text-[#5024fc] hover:underline cursor-pointer">
            Ver evolução <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        }
      />
      {weightTrail.length === 0 ? (
        <p className="text-sm text-slate-500">Sem avaliações físicas registradas nas consultas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <dl className="divide-y divide-slate-100">
            <ChangeRow label="Peso" unit=" kg" change={weight} direction={weightDirection} pctOfStart />
            <ChangeRow label="Gordura corporal" unit="%" change={bodyFat} direction={-1} />
            <ChangeRow label="Massa muscular" unit="%" change={muscleMass} direction={1} />
          </dl>
          {weightTrail.length >= 2 && (
            <figure className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Sparkline values={weightTrail} stroke={SERIES.primary} width={140} height={48} />
              <figcaption className="text-xs text-slate-500">
                Peso · {fmtShortDate(new Date(weightTrail[0].ts))} a {fmtShortDate(new Date(weightTrail[weightTrail.length - 1].ts))}
              </figcaption>
            </figure>
          )}
        </div>
      )}
    </Card>
  );
};
