import React, { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  Activity, Apple, CalendarDays, ClipboardList, Clock3, Home, LockKeyhole, LogOut, Phone, ShieldCheck, UserRound, UtensilsCrossed,
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

/** Barra lateral no padrão do painel da equipe (tema teal: `bg-sidebar-teal`). */
const Sidebar: React.FC = () => {
  const { patientPortal: p, signOut } = useAuth();
  const { countFor } = usePortalTasks();
  if (!p) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-col bg-sidebar-teal text-white lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-teal-700/20 px-6">
        <Link to="/portal" className="flex items-center rounded-lg focus-visible:ring-2 focus-visible:ring-teal-200" aria-label="Início">
          <Apple className="h-8 w-8 text-teal-200" aria-hidden="true" />
          <span className="ml-3 text-xl font-semibold tracking-tight text-white">NutriAI</span>
        </Link>
      </div>

      <nav aria-label="Seções" className="flex flex-1 flex-col overflow-y-auto px-4 pb-4 pt-6">
        <ul className="flex flex-1 flex-col space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => {
            const count = countFor(to);
            return (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-x-3 rounded-md p-3 text-sm font-medium leading-6 transition-colors duration-200',
                      isActive ? 'bg-teal-700/60 text-white' : 'text-teal-100 hover:bg-teal-700/40 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={cn('h-5 w-5 shrink-0 transition-colors duration-200', isActive ? 'text-white' : 'text-teal-300 group-hover:text-white')}
                        aria-hidden="true"
                      />
                      <span className="flex-1">{label}</span>
                      {count > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums text-teal-900">
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

        <div className="mt-6 space-y-1 border-t border-teal-700/30 pt-4">
          {p.clinic.name && (
            <div className="px-3 pb-2 text-xs leading-relaxed text-teal-100/80">
              <p className="font-medium text-white">{p.clinic.name}</p>
              {p.clinic.phone && (
                <a href={`tel:${p.clinic.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
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
            className="group flex w-full items-center gap-x-3 rounded-md p-3 text-sm font-medium leading-6 text-red-200 transition-colors hover:bg-teal-700/40 hover:text-white"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" /> Sair
          </button>
        </div>
      </nav>
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
    <div className="min-h-screen bg-slate-200 font-sans text-slate-800 antialiased selection:bg-teal-500/20 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-slate-900 focus:shadow-lg focus:outline focus:outline-2 focus:outline-[#5024fc]"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        {/* Cabeçalho no padrão do painel: faixa teal com o nome e o avatar à direita. */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-teal-700/20 bg-sidebar-teal px-4 text-white shadow-sm sm:px-6 lg:justify-end lg:px-8">
          <Link to="/portal" className="flex items-center rounded-lg focus-visible:ring-2 focus-visible:ring-teal-200 lg:hidden" aria-label="Início">
            <Apple className="h-7 w-7 text-teal-200" aria-hidden="true" />
            <span className="ml-2.5 text-lg font-semibold tracking-tight">NutriAI</span>
          </Link>
          <Link
            to="/portal/perfil"
            className="flex min-w-0 items-center gap-3 rounded-lg px-1 py-1 text-sm font-medium text-slate-100 hover:text-white focus-visible:ring-2 focus-visible:ring-teal-200"
            aria-label="Perfil"
          >
            <span className="hidden truncate sm:inline">{patientPortal.name.split(' ')[0]}</span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-semibold text-white ring-1 ring-white/30">
              {initials(patientPortal.name)}
            </span>
          </Link>
        </header>

        <main id="conteudo" className="flex-1 bg-slate-200">
          <div className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
            <div className="space-y-6">
              <AccessBanner
                accessUntil={patientPortal.access_until}
                active={patientPortal.active}
                nutritionist={patientPortal.nutritionist_name}
              />
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <MobileTabs />
    </div>
  );
};
