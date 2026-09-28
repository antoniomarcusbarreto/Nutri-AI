import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Peças comuns dos gráficos do Acompanhamento. Eixo X é TEMPO REAL (timestamp
 * numérico), não categoria: exames com 15 dias e com 8 meses de intervalo
 * ficam proporcionalmente espaçados.
 */
export const SERIES = {
  /** Série única de destaque (peso, biomarcador) — Azul de Ação do DESIGN.md. */
  primary: '#5024fc',
  /** Par categórico validado (dataviz: slots 1 e 2, CVD ΔE 24.7). */
  slot1: '#2a78d6',
  slot2: '#eb6834',
  grid: '#e2e8f0',
  axis: '#64748b',
  reference: '#94a3b8',
} as const;

const DAY = 86_400_000;

/** Domínio do eixo de tempo com respiro nas pontas (evita ponto único colado na borda). */
export const timeDomain = (timestamps: number[]): [number, number] => {
  if (timestamps.length === 0) return [0, 1];
  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const pad = Math.max((max - min) * 0.04, 10 * DAY);
  return [min - pad, max + pad];
};

export const timeAxisProps = (timestamps: number[]) => {
  const domain = timeDomain(timestamps);
  // Janelas curtas repetiriam o mesmo "set/26" em vários ticks → usa dia/mês.
  const tickFormat = domain[1] - domain[0] < 120 * DAY ? 'dd/MM' : 'MMM/yy';
  return {
    type: 'number' as const,
    dataKey: 'ts',
    scale: 'time' as const,
    domain,
    tickFormatter: (ts: number) => format(ts, tickFormat, { locale: ptBR }),
    tick: { fill: SERIES.axis, fontSize: 11 },
    stroke: SERIES.grid,
    tickLine: false,
    minTickGap: 24,
  };
};

export const yAxisProps = {
  tick: { fill: SERIES.axis, fontSize: 11 },
  stroke: SERIES.grid,
  tickLine: false,
  axisLine: false,
  width: 40,
};

/**
 * Escala Y "redonda": domínio e ticks em passos 1/2/2,5/5 × 10ⁿ, para o eixo
 * mostrar 78 · 80 · 82 em vez de 77,8 · 81,8 · 85,8.
 */
export const niceScale = (values: number[], tickCount = 5): { domain: [number, number]; ticks: number[] } => {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; }
  const rough = (max - min) / (tickCount - 1);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= rough) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { domain: [lo, hi], ticks };
};
