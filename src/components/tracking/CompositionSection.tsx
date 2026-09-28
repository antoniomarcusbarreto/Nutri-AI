import React, { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Scale } from 'lucide-react';
import { Card, EmptyState } from '../ui';
import type { MealPlanRecord, RechartsTooltipProps } from '../../types/clinical';
import { ChartTooltipBox, SectionHeader } from './chartKit';
import { DOMAIN } from './trackingTheme';
import { niceScale, SERIES, timeAxisProps, yAxisProps } from './chartConfig';
import { bmiClass, fmtDelta, fmtNumber, fmtShortDate, type BodyPoint } from './trackingModel';

type MetricKey = 'weight' | 'bmi' | 'bodyFat' | 'muscleMass';

/**
 * Cada métrica tem o gradiente da cor da sua linha no gráfico (peso = azul de
 * ação, gordura = laranja, músculo = azul) — o card e a série se reconhecem.
 * IMC é derivado do peso e não tem linha própria: fica em grafite neutro.
 * Tons -600/-700: texto branco pequeno >= 4.5:1.
 */
const METRICS: { key: MetricKey; label: string; unit: string; gradient: string }[] = [
  { key: 'weight', label: 'Peso', unit: ' kg', gradient: 'from-[#5024fc] to-indigo-700' },
  { key: 'bmi', label: 'IMC', unit: '', gradient: 'from-slate-700 to-slate-900' },
  { key: 'bodyFat', label: 'Gordura corporal', unit: '%', gradient: 'from-orange-600 to-orange-700' },
  { key: 'muscleMass', label: 'Massa muscular', unit: '%', gradient: 'from-blue-600 to-blue-700' },
];

/**
 * Último valor do período + variação vs medição anterior (no histórico todo,
 * como nos biomarcadores) e vs a primeira medição do período.
 */
const summarize = (points: BodyPoint[], history: BodyPoint[], key: MetricKey) => {
  const withValue = points.filter((p) => p[key] != null);
  if (withValue.length === 0) return null;
  const last = withValue[withValue.length - 1];
  const prev = history.filter((p) => p[key] != null && p.ts < last.ts).pop() ?? null;
  const first = withValue[0];
  const v = last[key] as number;
  return {
    value: v,
    date: last.date,
    vsPrev: prev ? v - (prev[key] as number) : null,
    vsFirst: withValue.length > 2 ? { delta: v - (first[key] as number), date: first.date } : null,
  };
};

interface KpiProps {
  label: string;
  unit: string;
  gradient: string;
  summary: ReturnType<typeof summarize>;
  extra?: string | null;
}

const DeltaIcon: React.FC<{ delta: number }> = ({ delta }) => {
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight;
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
};

/** Card de métrica no vocabulário dos stat cards do Dashboard (gradiente + pílulas translúcidas). */
const Kpi: React.FC<KpiProps> = ({ label, unit, gradient, summary, extra }) => (
  <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} px-4 py-3.5 shadow-md ${summary ? '' : 'opacity-60'}`}>
    <p className="text-xs font-medium uppercase tracking-wider text-white/80">{label}</p>
    {summary ? (
      <>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-white tabular-nums">
          <span className="text-3xl font-medium tracking-tight text-white">{fmtNumber(summary.value)}</span>
          <span className="text-sm text-white/80">{unit.trim()}</span>
          {extra && <span className="ml-1 rounded-full border border-white/15 bg-white/15 px-2 py-0.5 text-xs font-medium text-white">{extra}</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-white tabular-nums">
          {summary.vsPrev != null ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/15 px-2 py-0.5">
              <DeltaIcon delta={summary.vsPrev} />{fmtDelta(summary.vsPrev)}{unit} vs anterior
            </span>
          ) : (
            <span className="rounded-full border border-white/15 bg-white/15 px-2 py-0.5">Primeira medição</span>
          )}
          {summary.vsFirst && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5">
              <DeltaIcon delta={summary.vsFirst.delta} />{fmtDelta(summary.vsFirst.delta)}{unit} desde {fmtShortDate(summary.vsFirst.date)}
            </span>
          )}
        </div>
      </>
    ) : (
      <p className="mt-1.5 text-3xl font-medium text-white/80">—</p>
    )}
  </div>
);

/** Tooltips hoisted (react-hooks/static-components). */
const WeightTooltip: React.FC<RechartsTooltipProps> = ({ active, payload }) => {
  const p = active ? (payload?.[0]?.payload as BodyPoint | undefined) : undefined;
  if (!p) return null;
  return (
    <ChartTooltipBox
      date={p.date}
      rows={[
        { label: 'Peso', value: `${fmtNumber(p.weight!)} kg`, color: SERIES.primary },
        ...(p.bmi != null ? [{ label: 'IMC', value: fmtNumber(p.bmi) }] : []),
      ]}
    />
  );
};

const PctTooltip: React.FC<RechartsTooltipProps> = ({ active, payload }) => {
  const p = active ? (payload?.[0]?.payload as BodyPoint | undefined) : undefined;
  if (!p) return null;
  return (
    <ChartTooltipBox
      date={p.date}
      rows={[
        ...(p.bodyFat != null ? [{ label: 'Gordura', value: `${fmtNumber(p.bodyFat)}%`, color: SERIES.slot2 }] : []),
        ...(p.muscleMass != null ? [{ label: 'Massa muscular', value: `${fmtNumber(p.muscleMass)}%`, color: SERIES.slot1 }] : []),
      ]}
    />
  );
};

export interface CompositionSectionProps {
  /** Medições dentro do período, em ordem cronológica. */
  points: BodyPoint[];
  /** Todas as medições do paciente (base do "vs anterior"). */
  history: BodyPoint[];
  /** Planos alimentares do período — viram marcadores verticais nos gráficos. */
  plans: MealPlanRecord[];
  /** Idade do paciente: a classificação de IMC da OMS só vale para adultos. */
  age: number | null;
  periodText: string;
}

/**
 * Composição corporal: números atuais com variação e dois gráficos separados
 * (peso em kg / gordura e músculo em %) — nunca dois eixos Y no mesmo gráfico.
 * As linhas verticais tracejadas marcam cada novo plano alimentar, para o
 * nutricionista ver o efeito de cada intervenção.
 */
export const CompositionSection: React.FC<CompositionSectionProps> = ({ points, history, plans, age, periodText }) => {
  const summaries = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, summarize(points, history, m.key)])) as Record<MetricKey, ReturnType<typeof summarize>>,
    [points, history],
  );
  const bmi = summaries.bmi?.value;
  const bmiExtra = bmi != null && (age == null || age >= 20) ? bmiClass(bmi) : null;

  const weightPoints = points.filter((p) => p.weight != null);
  const pctPoints = points.filter((p) => p.bodyFat != null || p.muscleMass != null);
  const hasFat = pctPoints.some((p) => p.bodyFat != null);
  const hasMuscle = pctPoints.some((p) => p.muscleMass != null);
  const weightScale = niceScale(weightPoints.map((p) => p.weight as number));
  const pctScale = niceScale(pctPoints.flatMap((p) => [p.bodyFat, p.muscleMass]).filter((v): v is number => v != null));

  const planMarkers = () =>
    plans.map((plan) => (
      <ReferenceLine
        key={plan.id}
        x={new Date(plan.created_at).getTime()}
        stroke={DOMAIN.mealplan.solid}
        strokeOpacity={0.7}
        strokeDasharray="4 4"
        label={{ value: `${plan.kcal} kcal`, position: 'insideTopLeft', fill: '#b45309', fontSize: 11, fontWeight: 500 }}
      />
    ));

  return (
    <Card as="section" aria-labelledby="composition-title" className="space-y-5">
      <SectionHeader
        id="composition-title"
        icon={<Scale />}
        plate={DOMAIN.metrics.dot}
        title="Composição corporal"
        subtitle={`Medições registradas nas consultas ${periodText}`}
      />

      {points.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Scale />}
          title={`Nenhuma avaliação física ${periodText}`}
          description="Peso, gordura e massa muscular registrados na consulta aparecem aqui."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRICS.map((m) => (
              <Kpi key={m.key} label={m.label} unit={m.unit} gradient={m.gradient} summary={summaries[m.key]} extra={m.key === 'bmi' ? bmiExtra : null} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <figure className="rounded-2xl border border-slate-200 bg-white p-4">
              <figcaption className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES.primary }} aria-hidden="true" /> Peso (kg)
              </figcaption>
              {weightPoints.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-500">Sem registros de peso.</p>
              ) : (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weightPoints} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={SERIES.grid} strokeDasharray="3 3" />
                      <XAxis {...timeAxisProps(weightPoints.map((p) => p.ts))} />
                      <YAxis {...yAxisProps} domain={weightScale.domain} ticks={weightScale.ticks} tickFormatter={(v: number) => fmtNumber(v)} />
                      <Tooltip content={<WeightTooltip />} cursor={{ stroke: SERIES.reference, strokeDasharray: '3 3' }} />
                      {planMarkers()}
                      <Area type="linear" dataKey="weight" name="Peso" stroke={SERIES.primary} strokeWidth={2.5} fill="url(#weightFill)" dot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: SERIES.primary }} activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#fff' }} connectNulls isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </figure>

            <figure className="rounded-2xl border border-slate-200 bg-white p-4">
              <figcaption className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-slate-700">
                Composição (%)
                {hasFat && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-normal text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES.slot2 }} /> Gordura
                  </span>
                )}
                {hasMuscle && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-normal text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES.slot1 }} /> Massa muscular
                  </span>
                )}
              </figcaption>
              {pctPoints.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-500">Sem registros de gordura ou massa muscular.</p>
              ) : (
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pctPoints} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={SERIES.grid} strokeDasharray="3 3" />
                      <XAxis {...timeAxisProps(pctPoints.map((p) => p.ts))} />
                      <YAxis {...yAxisProps} domain={pctScale.domain} ticks={pctScale.ticks} tickFormatter={(v: number) => fmtNumber(v)} />
                      <Tooltip content={<PctTooltip />} cursor={{ stroke: SERIES.reference, strokeDasharray: '3 3' }} />
                      {planMarkers()}
                      {hasFat && <Line type="linear" dataKey="bodyFat" name="Gordura" stroke={SERIES.slot2} strokeWidth={2.5} dot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: SERIES.slot2 }} activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#fff' }} connectNulls isAnimationActive={false} />}
                      {hasMuscle && <Line type="linear" dataKey="muscleMass" name="Massa muscular" stroke={SERIES.slot1} strokeWidth={2.5} dot={{ r: 4.5, strokeWidth: 2, stroke: '#fff', fill: SERIES.slot1 }} activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#fff' }} connectNulls isAnimationActive={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </figure>
          </div>
          {plans.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <span className="h-3 w-0 border-l-2 border-dashed border-amber-500" aria-hidden="true" />
              Linha âmbar tracejada = início de um novo plano alimentar (kcal).
            </p>
          )}
        </>
      )}
    </Card>
  );
};
