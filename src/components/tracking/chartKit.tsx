import React from 'react';
import { fmtDate } from './trackingModel';

/** Título de seção com placa de ícone na cor do domínio (ver trackingTheme). */
export const SectionHeader: React.FC<{
  id: string;
  icon: React.ReactNode;
  plate: string;
  title: string;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ id, icon, plate, title, subtitle, actions }) => (
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm [&>svg]:h-5 [&>svg]:w-5 ${plate}`} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
    {actions}
  </header>
);

/**
 * Minigráfico em SVG puro — uma dúzia de ResponsiveContainers custaria caro.
 * Com menos de 2 pontos não há tendência para mostrar.
 */
export const Sparkline: React.FC<{
  values: { ts: number; value: number }[];
  stroke: string;
  /** Cor do ponto final (ex.: vermelho quando o último resultado está alterado). */
  dotColor?: string;
  width?: number;
  height?: number;
}> = ({ values, stroke, dotColor = stroke, width: w = 72, height: h = 22 }) => {
  if (values.length < 2) return <span className="text-xs text-slate-400">—</span>;
  const xs = values.map((p) => p.ts);
  const ys = values.map((p) => p.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (x: number) => (x1 === x0 ? w / 2 : ((x - x0) / (x1 - x0)) * (w - 4) + 2);
  const py = (y: number) => (y1 === y0 ? h / 2 : h - 2 - ((y - y0) / (y1 - y0)) * (h - 4));
  const d = values.map((p, i) => `${i ? 'L' : 'M'}${px(p.ts).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(last.ts)} cy={py(last.value)} r={3} fill={dotColor} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
};

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** Tooltip no padrão do app: data no topo, valores em tinta de texto (a cor fica só no marcador). */
export const ChartTooltipBox: React.FC<{ date: Date; rows: TooltipRow[]; footer?: React.ReactNode }> = ({ date, rows, footer }) => (
  <div className="min-w-[180px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-md">
    <p className="mb-1.5 text-xs font-medium text-slate-500">{fmtDate(date)}</p>
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />}
          <span className="text-slate-600">{r.label}</span>
          <span className="ml-auto font-medium text-slate-900 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
    {footer && <div className="mt-2 border-t border-slate-100 pt-1.5 text-xs text-slate-500">{footer}</div>}
  </div>
);
