import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RechartsTooltipProps } from '../../types/clinical';
import type { CashflowPoint } from '../../hooks/queries/useFinance';
import { cn } from '../../lib/cn';
import { Card } from '../ui';
import { SERIES, yAxisProps } from '../tracking/chartConfig';
import { brl, deltaPct, METHOD_LABEL, monthLabel, type MonthSummary } from './financeModel';

/** Par categórico validado (dataviz slots 1/2), o mesmo do Acompanhamento. */
const COLOR = { received: SERIES.slot1, expenses: SERIES.slot2 } as const;

/** Eixo Y compacto ("4,5 mil"); o "R$" fica no tooltip, para o rótulo não quebrar linha. */
const compactBrl = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR');

/**
 * Barra desenhada à mão: topo com raio de 4px, base reta no eixo. O
 * `<Rectangle>` padrão do Recharts 3.8 dispara "object is not extensible" no
 * ciclo de ref do StrictMode do React 19; um `<path>` simples evita isso.
 */
const BarShape = (props: unknown) => {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props as { x?: number; y?: number; width?: number; height?: number; fill?: string };
  if (width <= 0 || height <= 0) return <g />;
  const r = Math.min(4, width / 2, height);
  const d = `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
  return <path d={d} fill={fill} />;
};

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

const Delta: React.FC<{ current: number; previous: number; invert?: boolean }> = ({ current, previous, invert }) => {
  const pct = deltaPct(current, previous);
  if (pct === null) return <span className="text-slate-400">sem base no mês anterior</span>;
  if (pct === 0) return <span className="text-slate-500">igual ao mês anterior</span>;
  const up = pct > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5', good ? 'text-emerald-700' : 'text-rose-700')}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {up ? '+' : ''}{pct}% vs. mês anterior
    </span>
  );
};

const Tile: React.FC<{
  label: string;
  value: string;
  valueClass?: string;
  children?: React.ReactNode;
}> = ({ label, value, valueClass = 'text-slate-900', children }) => (
  <Card padding="sm" className="flex flex-col gap-1">
    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
    <p className={cn('text-2xl font-semibold tabular-nums', valueClass)}>{value}</p>
    <div className="text-xs text-slate-500">{children}</div>
  </Card>
);

// ---------------------------------------------------------------------------
// Gráfico
// ---------------------------------------------------------------------------

const CashflowTooltip: React.FC<RechartsTooltipProps> = ({ active, payload }) => {
  const p = active ? (payload?.[0]?.payload as CashflowPoint | undefined) : undefined;
  if (!p) return null;
  const result = Math.round((p.received - p.expenses) * 100) / 100;
  return (
    <div className="min-w-[200px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-md">
      <p className="mb-1.5 text-xs font-medium capitalize text-slate-500">{monthLabel(p.ref)}</p>
      <div className="space-y-1 text-xs">
        {([['Recebido', p.received, COLOR.received], ['Despesas pagas', p.expenses, COLOR.expenses]] as const).map(([label, v, color]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-slate-600">{label}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-900">{brl(v)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 text-xs">
        <span className="text-slate-500">Resultado</span>
        <span className="font-medium tabular-nums text-slate-900">{brl(result)}</span>
      </div>
    </div>
  );
};

const LegendKey: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
    {label}
  </span>
);

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

export interface OverviewTabProps {
  summary: MonthSummary;
  previous: MonthSummary;
  history: CashflowPoint[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ summary: s, previous: prev, history }) => {
  const hasHistory = history.some((p) => p.received > 0 || p.expenses > 0);
  const chartData = history.map((p) => ({ ...p, label: monthLabel(p.ref, 'MMM') }));
  const maxService = s.byService[0]?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Recebido" value={brl(s.received)} valueClass="text-[#5024fc]">
          <Delta current={s.received} previous={prev.received} />
        </Tile>
        <Tile label="A receber" value={brl(s.toReceive)}>
          {s.overdueCount > 0
            ? <span className="text-rose-700">{brl(s.overdue)} vencido ({s.overdueCount})</span>
            : `${s.toReceiveCount} ${s.toReceiveCount === 1 ? 'cobrança' : 'cobranças'} em aberto`}
        </Tile>
        <Tile label="Despesas" value={brl(s.expenses)}>
          {s.expensesPending > 0 ? `${brl(s.expensesPending)} ainda a pagar` : <Delta current={s.expenses} previous={prev.expenses} invert />}
        </Tile>
        <Tile
          label="Resultado de caixa"
          value={brl(s.result)}
          valueClass={s.result < 0 ? 'text-rose-700' : 'text-slate-900'}
        >
          {s.result < 0 ? 'Saiu mais do que entrou' : 'Recebido menos despesas pagas'}
        </Tile>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card as="section" aria-labelledby="cashflow-title" padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cashflow-title" className="text-sm font-semibold text-slate-900">Entradas e saídas · últimos 6 meses</h2>
            <div className="flex items-center gap-4">
              <LegendKey color={COLOR.received} label="Recebido" />
              <LegendKey color={COLOR.expenses} label="Despesas pagas" />
            </div>
          </div>
          {hasHistory ? (
            <>
              <div className="mt-4 h-64" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={SERIES.grid} />
                    <XAxis dataKey="label" tick={{ fill: SERIES.axis, fontSize: 11 }} stroke={SERIES.grid} tickLine={false} className="capitalize" />
                    <YAxis {...yAxisProps} width={52} tickFormatter={compactBrl} />
                    <Tooltip content={<CashflowTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
                    <Bar dataKey="received" name="Recebido" fill={COLOR.received} maxBarSize={28} shape={BarShape} isAnimationActive={false} />
                    <Bar dataKey="expenses" name="Despesas pagas" fill={COLOR.expenses} maxBarSize={28} shape={BarShape} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="sr-only">
                <caption>Recebido e despesas pagas por mês</caption>
                <thead><tr><th>Mês</th><th>Recebido</th><th>Despesas pagas</th></tr></thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.key}><td>{monthLabel(p.ref)}</td><td>{brl(p.received)}</td><td>{brl(p.expenses)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              O gráfico aparece quando houver recebimentos ou despesas pagas nos últimos meses.
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card as="section" aria-labelledby="ticket-title" padding="sm">
            <h2 id="ticket-title" className="text-sm font-semibold text-slate-900">Ticket médio</h2>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{brl(s.avgTicket)}</p>
            <p className="text-xs text-slate-500">
              {s.receivedCount} {s.receivedCount === 1 ? 'pagamento recebido' : 'pagamentos recebidos'} no mês
            </p>
          </Card>

          <Card as="section" aria-labelledby="methods-title" padding="sm">
            <h2 id="methods-title" className="text-sm font-semibold text-slate-900">Formas de pagamento</h2>
            {s.byMethod.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nenhum recebimento no mês.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {s.byMethod.map((m) => (
                  <li key={m.method} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-700">{METHOD_LABEL[m.method]} <span className="text-xs text-slate-400">· {m.count}</span></span>
                    <span className="tabular-nums text-slate-900">{brl(m.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card as="section" aria-labelledby="services-title" padding="sm">
        <h2 id="services-title" className="text-sm font-semibold text-slate-900">Receita por serviço</h2>
        {s.byService.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhum recebimento no mês.</p>
        ) : (
          <ul className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {s.byService.map((row) => (
              <li key={row.name}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-700">{row.name} <span className="text-xs text-slate-400">· {row.count}</span></span>
                  <span className="shrink-0 tabular-nums text-slate-900">{brl(row.total)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${maxService ? Math.max(4, (row.total / maxService) * 100) : 0}%`, backgroundColor: COLOR.received }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
