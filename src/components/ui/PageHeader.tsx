import React from 'react';

/**
 * Cabeçalho de página do painel (1ª onda do design system — extract P1.4).
 *
 * Consolida o par `<h1 class="text-3xl font-semibold text-slate-900
 * tracking-tight"> + <p class="text-sm text-slate-500">` que abre toda rota
 * autenticada. O peso e a cor do `<h1>` já são travados pela camada de
 * `index.css` (headline = 600, slate-900 sólido); aqui só padronizamos a
 * composição e o espaçamento.
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ícone opcional à esquerda do título. */
  icon?: React.ReactNode;
  /** Ações à direita (botões, seletores). */
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, icon, actions, className = '' }) => (
  <div className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0 ${className}`}>
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-slate-900">
        {icon}
        {title}
      </h1>
      {typeof description === 'string' || typeof description === 'number' ? (
        <p className="mt-1 max-w-2xl text-sm font-normal text-slate-500">{description}</p>
      ) : description ? (
        <div className="mt-1 text-sm font-normal text-slate-500">{description}</div>
      ) : null}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
  </div>
);
