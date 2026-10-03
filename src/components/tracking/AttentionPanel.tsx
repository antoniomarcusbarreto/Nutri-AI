import React from 'react';
import { AlertTriangle, BellRing, CheckCircle2, ChevronRight, CircleAlert } from 'lucide-react';
import { Card } from '../ui';
import { cn } from '../../lib/cn';
import { SectionHeader } from './chartKit';
import type { AttentionItem, AttentionTarget } from './trackingModel';

const TONE = {
  bad: { row: 'border-rose-100 bg-rose-50', icon: 'text-rose-600', title: 'text-rose-800', Icon: CircleAlert },
  warn: { row: 'border-amber-100 bg-amber-50', icon: 'text-amber-600', title: 'text-amber-800', Icon: AlertTriangle },
} as const;

export interface AttentionPanelProps {
  items: AttentionItem[];
  onAction: (target: AttentionTarget) => void;
}

/** "O que pede ação agora": sinais que antes ficavam espalhados pelas seções. */
export const AttentionPanel: React.FC<AttentionPanelProps> = ({ items, onAction }) => (
  <Card as="section" aria-labelledby="attention-title" className="space-y-4">
    <SectionHeader
      id="attention-title"
      icon={<BellRing />}
      plate="bg-rose-600 text-white"
      title="Pontos de atenção"
      subtitle={items.length === 0 ? 'Situação atual do paciente' : `${items.length} ${items.length > 1 ? 'itens pedem' : 'item pede'} atenção`}
    />
    {items.length === 0 ? (
      <p className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        Nenhum ponto de atenção: exames, retornos e plano em dia.
      </p>
    ) : (
      <ul className="space-y-2">
        {items.map((item) => {
          const t = TONE[item.tone];
          return (
            <li key={item.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border px-4 py-3', t.row)}>
              <t.Icon className={cn('h-4.5 w-4.5 shrink-0', t.icon)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', t.title)}>{item.title}</p>
                {item.detail && <p className="mt-0.5 text-xs text-slate-600">{item.detail}</p>}
              </div>
              {item.action && (
                <button
                  type="button"
                  onClick={() => onAction(item.action!.target)}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {item.action.label}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);
