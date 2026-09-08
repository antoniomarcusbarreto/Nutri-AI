import React from 'react';

/**
 * Estado vazio do painel (1ª onda do design system — extract P1.4).
 *
 * Consolida o bloco tracejado `border-2 border-dashed rounded-3xl bg-slate-50`
 * + ícone + título + descrição repetido em Dashboard, Exames, Tracking,
 * MealPlans e Agenda. Contraste e pesos seguem o DESIGN.md (título 500 slate-900,
 * descrição 400 slate-500).
 */
export type EmptyStateSize = 'md' | 'sm';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  size?: EmptyStateSize;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, size = 'md', className = '' }) => (
  <div
    className={
      `flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/30 text-center ` +
      (size === 'md' ? 'min-h-[220px] px-6 py-14 ' : 'px-4 py-8 ') +
      className
    }
  >
    {icon && <div className="mb-2.5 text-slate-300 [&>svg]:h-10 [&>svg]:w-10 [&>svg]:stroke-[1.4]">{icon}</div>}
    <p className={`font-medium text-slate-900 ${size === 'md' ? 'text-lg' : 'text-sm'}`}>{title}</p>
    {description && <p className="mt-1 text-sm font-normal text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
