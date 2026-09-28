import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  ReferenceArea,
  ReferenceLine,
  Area,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, FlaskConical, TrendingUp } from 'lucide-react';
import { Card, EmptyState } from '../ui';
import { cn } from '../../lib/cn';
import type { RechartsTooltipProps } from '../../types/clinical';
import { ChartTooltipBox, SectionHeader } from './chartKit';
import { DOMAIN } from './trackingTheme';
import { niceScale, SERIES, timeAxisProps, yAxisProps } from './chartConfig';
import {
  fmtDelta,
  fmtShortDate,
  inRange,
  parseReferenceRange,
  type BiomarkerPoint,
  type BiomarkerSeries,
  type DateRange,
  type ReferenceRange,
} from './trackingModel';

const COLLAPSED_ROWS = 8;

/** Distância até a faixa de referência (0 = dentro). */
const distanceToRange = (v: number, r: ReferenceRange) =>
  r.low != null && v < r.low ? r.low - v : r.high != null && v > r.high ? v - r.high : 0;

type Trend = 'better' | 'worse' | 'same' | null;

interface Row {
  name: string;
  inPeriod: BiomarkerPoint[];
  last: BiomarkerPoint;
  prev: BiomarkerPoint | null;
  delta: number | null;
  trend: Trend;
  range: ReferenceRange | null;
}

const buildRows = (series: BiomarkerSeries[], range: DateRange): Row[] =>
  series
    .map((s): Row | null => {
      const inPeriod = s.points.filter((p) => inRange(p.date, range));
      if (inPeriod.length === 0) return null;
      const last = inPeriod[inPeriod.length - 1];
      // "Anterior" olha o histórico inteiro: comparar com o exame anterior é
      // útil mesmo quando ele caiu fora do período selecionado.
      const idx = s.points.indexOf(last);
      const prev = idx > 0 ? s.points[idx - 1] : null;
      const delta = prev && last.value != null && prev.value != null ? last.value - prev.value : null;
      const refRange = parseReferenceRange(last.reference);
      let trend: Trend = null;
      if (refRange && delta != null && last.value != null && prev?.value != null) {
        const dNow = distanceToRange(last.value, refRange);
        const dPrev = distanceToRange(prev.value, refRange);
        trend = dNow < dPrev ? 'better' : dNow > dPrev ? 'worse' : 'same';
      }
      return { name: s.name, inPeriod, last, prev, delta, trend, range: refRange };
    })
    .filter((r): r is Row => r !== null)
    .sort((a, b) => Number(b.last.altered) - Number(a.last.altered) || a.name.localeCompare(b.name, 'pt-BR'));

const TREND_UI: Record<Exclude<Trend, null>, { label: string; className: string }> = {
  better: { label: 'aproximou-se da referência', className: 'bg-emerald-50 text-emerald-700' },
  worse: { label: 'afastou-se da referência', className: 'bg-rose-50 text-rose-700' },
  same: { label: 'sem mudança em relação à referência', className: 'bg-slate-100 text-slate-600' },
};

/** Minigráfico em SVG puro — uma dúzia de ResponsiveContainers custaria caro. */
const TREND_STROKE: Record<Exclude<Trend, null>, string> = { better: '#059669', worse: '#e11d48', same: '#64748b' };

const Sparkline: React.FC<{ points: BiomarkerPoint[]; trend: Trend }> = ({ points, trend }) => {
  const vals = points.filter((p) => p.value != null);
  if (vals.length < 2) return <span className="text-xs text-slate-400">—</span>;
  const w = 72;
  const h = 22;
  const xs = vals.map((p) => p.ts);
  const ys = vals.map((p) => p.value as number);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (x: number) => (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * (w - 4) + 2);
  const py = (y: number) => (y1 === y0 ? h / 2 : h - 2 - ((y - y0) / (y1 - y0)) * (h - 4));
  const d = vals.map((p, i) => `${i ? 'L' : 'M'}${px(p.ts).toFixed(1)},${py(p.value as number).toFixed(1)}`).join(' ');
  const last = vals[vals.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={trend ? TREND_STROKE[trend] : '#64748b'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(last.ts)} cy={py(last.value as number)} r={3} fill={last.altered ? '#e11d48' : '#059669'} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
};

const BiomarkerTooltip: React.FC<RechartsTooltipProps> = ({ active, payload }) => {
  const p = active ? (payload?.[0]?.payload as BiomarkerPoint | undefined) : undefined;
  if (!p) return null;
  return (
    <ChartTooltipBox
      date={p.date}
      rows={[{ label: 'Resultado', value: p.raw, color: p.altered ? '#e11d48' : SERIES.primary }]}
      footer={<>Referência: {p.reference || '—'}{p.altered ? ' · Alterado' : ''}</>}
    />
  );
};

/** Ponto do gráfico: vermelho quando o laudo marcou o valor como alterado. */
const StatusDot: React.FC<{ cx?: number; cy?: number; payload?: BiomarkerPoint }> = ({ cx, cy, payload }) =>
  cx == null || cy == null ? null : (
    <circle cx={cx} cy={cy} r={5} strokeWidth={2} stroke="#fff" fill={payload?.altered ? '#e11d48' : '#059669'} />
  );

const SUMMARY_TONE = {
  good: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  bad: 'border-rose-100 bg-rose-50 text-rose-700',
} as const;

const SummaryTile: React.FC<{ tone: keyof typeof SUMMARY_TONE; icon: React.ReactNode; value: number; label: string }> = ({ tone, icon, value, label }) => (
  <li className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', value === 0 ? 'border-slate-200 bg-white text-slate-500' : SUMMARY_TONE[tone])}>
    <span className="shrink-0 [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">{icon}</span>
    <span className="min-w-0">
      <span className="block text-2xl font-medium leading-none tabular-nums">{value}</span>
      <span className="mt-1 block text-xs">{label}</span>
    </span>
  </li>
);

export interface BiomarkersSectionProps {
  series: BiomarkerSeries[];
  range: DateRange;
  periodText: string;
  onOpenExam: (examId: string) => void;
}

/**
 * Biomarcadores: tabela comparativa (último × anterior × referência), com os
 * alterados primeiro, e o gráfico de UM marcador por vez com a faixa de
 * referência sombreada. Substitui o gráfico único com todos os marcadores na
 * mesma escala (glicose ~90 esmagava TSH ~2 numa linha reta).
 */
export const BiomarkersSection: React.FC<BiomarkersSectionProps> = ({ series, range, periodText, onOpenExam }) => {
  const rows = useMemo(() => buildRows(series, range), [series, range]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const selected = rows.find((r) => r.name === selectedName) ?? rows[0] ?? null;
  const alteredCount = rows.filter((r) => r.last.altered).length;
  const normalCount = rows.length - alteredCount;
  const betterCount = rows.filter((r) => r.trend === 'better').length;
  const worseCount = rows.filter((r) => r.trend === 'worse').length;
  const latestExam = rows.reduce<BiomarkerPoint | null>((acc, r) => (!acc || r.last.ts > acc.ts ? r.last : acc), null);

  // Garante que o marcador selecionado continue visível mesmo com a tabela recolhida.
  const collapsedRows = rows.slice(0, Math.max(COLLAPSED_ROWS, alteredCount));
  const visibleRows = expanded || !selected || collapsedRows.includes(selected)
    ? (expanded ? rows : collapsedRows)
    : [...collapsedRows, selected];

  const chartData = selected?.inPeriod.filter((p) => p.value != null) ?? [];
  // Escala inclui a faixa de referência, para a banda sombreada aparecer inteira.
  const yScale = selected && chartData.length > 0
    ? niceScale([
        ...chartData.map((p) => p.value as number),
        ...(selected.range?.low != null ? [selected.range.low] : []),
        ...(selected.range?.high != null ? [selected.range.high] : []),
      ])
    : null;
  const yDomain = yScale ? ([Math.max(0, yScale.domain[0]), yScale.domain[1]] as [number, number]) : undefined;

  return (
    <Card as="section" aria-labelledby="biomarkers-title" className="space-y-5">
      <SectionHeader
        id="biomarkers-title"
        icon={<FlaskConical />}
        plate={DOMAIN.exam.dot}
        title="Biomarcadores"
        subtitle={`Resultados dos exames ${periodText}`}
        actions={latestExam && (
          <button
            type="button"
            onClick={() => onOpenExam(latestExam.examId)}
            className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 cursor-pointer"
          >
            Ver laudo de {fmtShortDate(latestExam.date)}
          </button>
        )}
      />

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<FlaskConical />}
          title={`Nenhum exame ${periodText}`}
          description="Os biomarcadores extraídos dos laudos enviados em Exames aparecem aqui."
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo do último resultado de cada biomarcador">
            <SummaryTile tone="bad" icon={<AlertTriangle />} value={alteredCount} label="alterado(s)" />
            <SummaryTile tone="good" icon={<CheckCircle2 />} value={normalCount} label="dentro da referência" />
            <SummaryTile tone="good" icon={<TrendingUp />} value={betterCount} label="aproximaram-se da referência" />
            <SummaryTile tone="bad" icon={<ArrowDownRight />} value={worseCount} label="afastaram-se da referência" />
          </ul>

          {selected && (
            <figure className="rounded-2xl border border-slate-200 bg-white p-4">
              <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {selected.name}
                  <span className={cn('rounded-md border px-1.5 py-0.5 text-xs font-medium', selected.last.altered ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700')}>
                    {selected.last.altered ? 'Alterado' : 'Normal'}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  {selected.range && <span className="h-2.5 w-4 rounded-sm border border-emerald-300 bg-emerald-100" aria-hidden="true" />}
                  {selected.range ? `Referência: ${selected.last.reference}` : `Referência: ${selected.last.reference || 'não informada'}`}
                </span>
              </figcaption>
              {chartData.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-500">Resultado não numérico ({selected.last.raw}).</p>
              ) : (
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="biomarkerFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.18} />
                          <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={SERIES.grid} strokeDasharray="3 3" />
                      {selected.range && (
                        <ReferenceArea
                          y1={selected.range.low ?? yDomain?.[0]}
                          y2={selected.range.high ?? yDomain?.[1]}
                          fill="#10b981"
                          fillOpacity={0.14}
                          stroke="none"
                          ifOverflow="extendDomain"
                        />
                      )}
                      {selected.range?.low != null && <ReferenceLine y={selected.range.low} stroke="#059669" strokeOpacity={0.5} strokeDasharray="4 4" />}
                      {selected.range?.high != null && <ReferenceLine y={selected.range.high} stroke="#059669" strokeOpacity={0.5} strokeDasharray="4 4" />}
                      <XAxis {...timeAxisProps(chartData.map((p) => p.ts))} />
                      <YAxis {...yAxisProps} domain={yDomain} ticks={yScale?.ticks.filter((t) => t >= 0)} tickFormatter={(v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v)} />
                      <Tooltip content={<BiomarkerTooltip />} cursor={{ stroke: SERIES.reference, strokeDasharray: '3 3' }} />
                      <Area type="linear" dataKey="value" stroke="none" fill="url(#biomarkerFill)" baseValue={yDomain?.[0]} isAnimationActive={false} tooltipType="none" activeDot={false} />
                      <Line type="linear" dataKey="value" stroke={SERIES.primary} strokeWidth={2.5} dot={<StatusDot />} activeDot={{ r: 6.5, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </figure>
          )}

          <div className="relative overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <caption className="sr-only">Comparativo de biomarcadores; selecione uma linha para ver a evolução no gráfico</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Biomarcador</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Último</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Anterior</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Variação</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Referência</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Tendência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((r) => {
                  const isSelected = r === selected;
                  const TrendIcon = r.delta == null ? null : r.delta > 0 ? ArrowUpRight : r.delta < 0 ? ArrowDownRight : ArrowRight;
                  return (
                    <tr key={r.name} className={cn(isSelected ? 'bg-indigo-50' : r.last.altered && 'bg-rose-50')}>
                      <th scope="row" className="px-4 py-2.5 font-normal">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setSelectedName(r.name)}
                          className={cn('text-left cursor-pointer hover:underline', isSelected ? 'font-medium text-[#5024fc]' : 'text-slate-900')}
                        >
                          {r.name}
                        </button>
                      </th>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', r.last.altered ? 'bg-rose-600' : 'bg-emerald-600')} aria-hidden="true" />
                          <span className={cn('font-medium', r.last.altered ? 'text-rose-700' : 'text-slate-900')}>{r.last.raw}</span>
                          {r.last.altered && <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-xs font-medium text-white">Alterado</span>}
                        </span>
                        <span className="block text-xs text-slate-500">{fmtShortDate(r.last.date)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.prev ? <>{r.prev.raw}<span className="block text-xs text-slate-500">{fmtShortDate(r.prev.date)}</span></> : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.delta == null || !TrendIcon ? '—' : (
                          <span
                            className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular-nums', r.trend ? TREND_UI[r.trend].className : 'text-slate-600')}
                            title={r.trend ? TREND_UI[r.trend].label : undefined}
                          >
                            <TrendIcon className="h-4 w-4" aria-hidden="true" />
                            {fmtDelta(r.delta)}
                            {r.trend && <span className="sr-only">, {TREND_UI[r.trend].label}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{r.last.reference || '—'}</td>
                      <td className="px-4 py-2.5"><Sparkline points={r.inPeriod} trend={r.trend} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > collapsedRows.length && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              {expanded ? 'Mostrar menos' : `Mostrar todos os ${rows.length} biomarcadores`}
            </button>
          )}
          <p className="text-xs text-slate-500">
            Variação em verde: o valor se aproximou da faixa de referência; em vermelho: se afastou.
          </p>
        </>
      )}
    </Card>
  );
};
