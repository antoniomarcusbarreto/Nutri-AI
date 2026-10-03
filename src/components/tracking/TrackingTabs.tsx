import React from 'react';
import { cn } from '../../lib/cn';
import { TAB_PANEL_ID, tabId, type TrackingTab } from './trackingModel';

const TABS: { id: TrackingTab; label: string }[] = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'corpo', label: 'Corpo' },
  { id: 'exames', label: 'Exames' },
  { id: 'historico', label: 'Histórico' },
];

export interface TrackingTabsProps {
  value: TrackingTab;
  onChange: (tab: TrackingTab) => void;
  /** Contador opcional por aba (ex.: biomarcadores alterados). */
  badges?: Partial<Record<TrackingTab, number>>;
}

/** Abas da página no mesmo padrão do Financeiro (pílula de ação na ativa). */
export const TrackingTabs: React.FC<TrackingTabsProps> = ({ value, onChange, badges }) => {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === value);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Seções do acompanhamento"
      onKeyDown={onKeyDown}
      className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-1"
    >
      {TABS.map((t) => {
        const active = t.id === value;
        const badge = badges?.[t.id];
        return (
          <button
            key={t.id}
            id={tabId(t.id)}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={TAB_PANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              active ? 'bg-[#5024fc] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            {t.label}
            {badge ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                  active ? 'bg-white/20 text-white' : 'bg-rose-600 text-white',
                )}
                aria-label={`${badge} alterado(s)`}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
