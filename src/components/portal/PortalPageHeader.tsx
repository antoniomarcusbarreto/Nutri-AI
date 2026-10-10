import React from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock3 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui';
import { cn } from '../../lib/cn';

/**
 * Gramática de página do portal, igual à do painel da equipe:
 *   - cabeçalho com título, apoio e a ação principal à direita;
 *   - logo abaixo, o aviso de acesso (vencendo / somente leitura), quando houver;
 *   - conteúdo em cards com o título DENTRO do card (título + linha de apoio).
 */

const EXPIRING_SOON_DAYS = 7;

const AccessNotice: React.FC = () => {
  const { patientPortal } = useAuth();
  if (!patientPortal) return null;
  const { active, access_until, nutritionist_name } = patientPortal;
  const until = new Date(access_until);
  const daysLeft = differenceInCalendarDays(until, new Date());
  if (active && daysLeft > EXPIRING_SOON_DAYS) return null;
  const nutri = nutritionist_name || 'seu nutricionista';

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm',
        active ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-300 bg-white text-slate-700',
      )}
    >
      <Clock3 className={cn('mt-px h-4 w-4 shrink-0', active ? 'text-amber-600' : 'text-slate-500')} aria-hidden="true" />
      <p>
        {active ? (
          <>
            Seu acesso vence {daysLeft <= 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`} (
            {format(until, "d 'de' MMMM", { locale: ptBR })}). Para continuar, fale com {nutri}.
          </>
        ) : (
          <>
            <strong className="font-semibold">Acesso somente leitura desde {format(until, "d 'de' MMMM", { locale: ptBR })}.</strong>{' '}
            Você ainda vê seu plano e suas consultas. Para confirmar ou remarcar, peça a renovação a {nutri}.
          </>
        )}
      </p>
    </div>
  );
};

/** Cabeçalho de página: título, apoio, ação principal à direita e o aviso de acesso. */
export const PortalPageHeader: React.FC<{ title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  description,
  actions,
}) => (
  <div className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 lg:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
    <AccessNotice />
  </div>
);

/** Card de conteúdo com o título dentro (padrão do Dashboard da equipe). */
export const PortalCard: React.FC<{
  id: string;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ id, title, hint, action, children, className }) => (
  <Card as="section" aria-labelledby={id} className={cn('flex flex-col', className)}>
    <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold text-slate-900">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </Card>
);

/** Mantido para telas que ainda agrupam por título solto. */
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
