import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Home, LockKeyhole, LogOut, ShieldCheck, Clock3, UserRound, UtensilsCrossed } from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Wordmark } from '../brand/Wordmark';
import { Button } from '../ui';
import { PORTAL_TERMS_VERSION } from '../../types/portal';
import { cn } from '../../lib/cn';

/**
 * Moldura do Portal do Paciente: pensada primeiro para o celular (abas
 * embaixo), com abas no topo a partir de `md`.
 *
 * Fica fora de `<main>` de propósito (landmark via `role="main"`): a camada
 * global de `index.css` re-estiliza `main label`/`main input` com `!important`.
 * Cores usam `teal-*`/`#5024fc` explícitos porque o tema da equipe reescreve
 * `--color-primary-*`.
 */

const TABS = [
  { to: '/portal', label: 'Início', icon: Home, end: true },
  { to: '/portal/plano', label: 'Plano', icon: UtensilsCrossed, end: false },
  { to: '/portal/agenda', label: 'Consultas', icon: CalendarDays, end: false },
  { to: '/portal/perfil', label: 'Perfil', icon: UserRound, end: false },
] as const;

const EXPIRING_SOON_DAYS = 7;

const CenteredCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex min-h-screen flex-col bg-slate-50 font-sans">
    <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <Wordmark />
    </header>
    <div role="main" className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-700">{icon}</div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {children}
      </div>
    </div>
  </div>
);

/** Sem prazo liberado (nunca convidado ou acesso encerrado pelo nutricionista). */
const NoAccess: React.FC = () => {
  const { signOut } = useAuth();
  return (
    <CenteredCard icon={<LockKeyhole className="h-6 w-6" aria-hidden="true" />} title="Acesso não liberado">
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Seu acesso ao app ainda não foi liberado ou foi encerrado. Peça ao seu nutricionista um novo link de convite.
      </p>
      <Button variant="secondary" fullWidth className="mt-7 h-11" leftIcon={<LogOut className="h-4 w-4" />} onClick={signOut}>
        Sair
      </Button>
    </CenteredCard>
  );
};

/** Termos novos (ou nunca aceitos): aceite antes de entrar. */
const TermsGate: React.FC = () => {
  const { refreshPortal, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('portal_accept_terms', { p_version: PORTAL_TERMS_VERSION });
    if (rpcError) {
      setError('Não foi possível registrar o aceite. Tente novamente.');
      setBusy(false);
      return;
    }
    await refreshPortal();
    setBusy(false);
  };

  return (
    <CenteredCard icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />} title="Antes de continuar">
      <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
        Seus dados de saúde ficam visíveis só para você e para o nutricionista que acompanha você.
      </p>
      <label className="mt-6 flex items-start gap-3 text-sm leading-relaxed text-slate-600">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#5024fc]"
        />
        <span>
          Li e aceito os <Link to="/termos" target="_blank" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Termos de Uso</Link> e
          a <Link to="/privacidade" target="_blank" className="font-medium text-[#5024fc] hover:text-[#431cdb]">Política de Privacidade</Link>,
          e autorizo o uso dos meus dados de saúde pelo meu nutricionista para o meu acompanhamento.
        </span>
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <Button variant="primary" fullWidth className="mt-7 h-11" disabled={!checked} loading={busy} onClick={accept}>
        Continuar
      </Button>
      <button type="button" onClick={signOut} className="mt-3 w-full rounded py-2 text-sm font-medium text-slate-500 hover:text-slate-800">
        Sair
      </button>
    </CenteredCard>
  );
};

const AccessBanner: React.FC<{ accessUntil: string; active: boolean; nutritionist: string | null }> = ({ accessUntil, active, nutritionist }) => {
  const until = new Date(accessUntil);
  const daysLeft = differenceInCalendarDays(until, new Date());
  if (active && daysLeft > EXPIRING_SOON_DAYS) return null;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
        active ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700',
      )}
    >
      <Clock3 className={cn('mt-px h-4 w-4 shrink-0', active ? 'text-amber-600' : 'text-slate-500')} aria-hidden="true" />
      <p>
        {active ? (
          <>
            Seu acesso vence {daysLeft <= 0 ? 'hoje' : daysLeft === 1 ? 'amanhã' : `em ${daysLeft} dias`} (
            {format(until, "d 'de' MMMM", { locale: ptBR })}). Para continuar, fale com {nutritionist || 'seu nutricionista'}.
          </>
        ) : (
          <>
            <strong className="font-semibold">Acesso somente leitura desde {format(until, "d 'de' MMMM", { locale: ptBR })}.</strong>{' '}
            Você ainda vê seu plano e suas consultas. Para confirmar ou remarcar, peça a renovação a {nutritionist || 'seu nutricionista'}.
          </>
        )}
      </p>
    </div>
  );
};

export const PortalLayout: React.FC = () => {
  const { patientPortal } = useAuth();

  if (!patientPortal) return <NoAccess />;
  if (patientPortal.terms_version !== PORTAL_TERMS_VERSION) return <TermsGate />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/portal" className="shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-teal-500" aria-label="Início">
            <Wordmark />
          </Link>
          {patientPortal.clinic.name && (
            <span className="min-w-0 truncate text-sm text-slate-500">{patientPortal.clinic.name}</span>
          )}
        </div>
        <nav aria-label="Seções" className="mx-auto hidden max-w-3xl gap-1 px-4 pb-2 sm:px-6 md:flex">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div role="main" className="mx-auto max-w-3xl space-y-5 px-4 pb-28 pt-5 sm:px-6 md:pb-12">
        <AccessBanner
          accessUntil={patientPortal.access_until}
          active={patientPortal.active}
          nutritionist={patientPortal.nutritionist_name}
        />
        <Outlet />
      </div>

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                    isActive ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-teal-50')}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};
