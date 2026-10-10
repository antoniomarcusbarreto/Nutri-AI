import React from 'react';

/** Cabeçalho de página do portal: título, apoio e ações à direita. */
export const PortalPageHeader: React.FC<{ title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  description,
  actions,
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-[1.875rem] lg:leading-tight">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500 lg:text-[15px]">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
  </div>
);

/** Bloco de seção dentro de uma página do portal (título + ação opcional + conteúdo). */
export const PortalSection: React.FC<{
  id: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ id, title, action, children, className }) => (
  <section aria-labelledby={id} className={className}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-base font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);
