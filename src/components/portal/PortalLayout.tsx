import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Activity, CalendarDays, ClipboardList, Clock3, Home, LockKeyhole, LogOut, Phone, ShieldCheck, UserRound, UtensilsCrossed,
} from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Wordmark } from '../brand/Wordmark';
import { Button } from '../ui';
import { PORTAL_TERMS_VERSION } from '../../types/portal';
import { cn } from '../../lib/cn';
import { usePortalTasks } from './usePortalTasks';

/**
 * Moldura do Portal do Paciente.
 *
 * - Desktop (lg+): barra lateral fixa com a identidade do paciente, a
 *   navegação completa (com contadores do que falta fazer) e o contato da
 *   clínica no rodapé; o conteúdo ocupa um painel largo à direita.
 * - Celular/tablet: cabeçalho compacto + abas embaixo (as 4 rotas mais
 *   usadas; ficha e avaliação ficam a um toque pela tela inicial e Perfil).
 *
 * Fica fora de `<main>` de propósito (landmark via `role="main"`): a camada
 * global de `index.css` re-estiliza `main label`/`main input`. Cores usam
 * `teal-*`/`#5024fc` explícitos porque o tema da equipe reescreve
 * `--color-primary-*`.
 */

const NAV = [
  { to: '/portal', label: 'Início', short: 'Início', icon: Home, end: true, mobile: true },
  { to: '/portal/plano', label: 'Plano alimentar', short: 'Plano', icon: UtensilsCrossed, end: false, mobile: true },
  { to: '/portal/agenda', label: 'Consultas', short: 'Consultas', icon: CalendarDays, end: false, mobile: true },
  { to: '/portal/ficha', label: 'Ficha de saúde', short: 'Ficha', icon: ClipboardList, end: false, mobile: false },
  { to: '/portal/avaliacao', label: 'Avaliação corporal', short: 'Avaliação', icon: Activity, end: false, mobile: false },
  { to: '/portal/perfil', label: 'Perfil', short: 'Perfil', icon: UserRound, end: false, mobile: true },
] as const;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'P';

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

const Sidebar: React.FC = () => {
  const { patientPortal: p, signOut } = useAuth();
  const { countFor } = usePortalTasks();
  if (!p) return null;

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="px-6 pb-6 pt-7">
        <Link to="/portal" className="inline-block rounded-xl focus-visible:ring-2 focus-visible:ring-teal-500" aria-label="Início">
          <Wordmark />
        </Link>
      </div>

      <div className="mx-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-600 text-sm font-semibold text-white" aria-hidden="true">
          {initials(p.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{p.name}</span>
          {p.nutritionist_name && <span className="block truncate text-xs text-slate-500">com {p.nutritionist_name}</span>}
        </span>
      </div>

      <nav aria-label="Seções" className="mt-6 flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => {
            const count = countFor(to);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-teal-50 text-teal-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600')}
                        aria-hidden="true"
                      />
                      <span className="flex-1">{label}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#5024fc] px-1.5 text-[11px] font-semibold tabular-nums text-white">
                          {count}
                          <span className="sr-only"> pendente{count > 1 ? 's' : ''}</span>
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-slate-100 p-4">
        {p.clinic.name && (
          <div className="px-3 pb-1 text-xs leading-relaxed text-slate-500">
            <p className="font-medium text-slate-700">{p.clinic.name}</p>
            {p.clinic.phone && (
              <a href={`tel:${p.clinic.phone}`} className="inline-flex items-center gap-1.5 hover:text-slate-800">
                <Phone className="h-3 w-3" aria-hidden="true" /> {p.clinic.phone}
              </a>
            )}
            <p className="mt-0.5 tabular-nums">
              {p.active ? 'Acesso até ' : 'Somente leitura desde '}
              {format(new Date(p.access_until), 'dd/MM/yyyy')}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
        </button>
      </div>
    </aside>
  );
};

const MobileTabs: React.FC = () => {
  const { countFor } = usePortalTasks();
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV.filter((n) => n.mobile).map(({ to, short, icon: Icon, end }) => {
          const count = countFor(to);
          return (
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
                    <span className={cn('relative grid h-7 w-12 place-items-center rounded-full transition-colors', isActive && 'bg-teal-50')}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      {count > 0 && (
                        <span className="absolute right-2 top-0 h-2 w-2 rounded-full bg-[#5024fc] ring-2 ring-white">
                          <span className="sr-only">{count} pendente{count > 1 ? 's' : ''}</span>
                        </span>
                      )}
                    </span>
                    {short}
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export const PortalLayout: React.FC = () => {
  const { patientPortal } = useAuth();

  if (!patientPortal) return <NoAccess />;
  if (patientPortal.terms_version !== PORTAL_TERMS_VERSION) return <TermsGate />;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-teal-500/20 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Sidebar />

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <Link to="/portal" className="shrink-0 rounded-xl focus-visible:ring-2 focus-visible:ring-teal-500" aria-label="Início">
              <Wordmark />
            </Link>
            <Link
              to="/portal/perfil"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              aria-label="Perfil"
            >
              {initials(patientPortal.name)}
            </Link>
          </div>
        </header>

        <div role="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">
          <div className="space-y-6">
            <AccessBanner
              accessUntil={patientPortal.access_until}
              active={patientPortal.active}
              nutritionist={patientPortal.nutritionist_name}
            />
            <Outlet />
          </div>
        </div>
      </div>

      <MobileTabs />
    </div>
  );
};
