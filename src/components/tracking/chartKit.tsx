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
