import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Wordmark } from '../brand/Wordmark';
import { HERO_VIDEO_URL } from '../brand/media';

/**
 * Moldura das telas de autenticação (login, cadastro, recuperação de senha).
 *
 * Duas metades que fazem a ponte entre as duas faces do produto: à esquerda o
 * painel escuro da landing (mesmo vídeo, gradiente e teal), à direita a
 * superfície clara e calma do app. No celular o painel vira uma faixa curta.
 *
 * Fica fora de `<main>` de propósito: a camada global de `index.css` re-estiliza
 * `main label`/`main input` com `!important`. O landmark vai por `role="main"`.
 * Cores usam `teal-*`/`#5024fc` explícitos (não `primary-*`), porque o tema de
 * navegação escolhido por um usuário logado reescreve `--color-primary-*` no `<html>`.
 */

const CLAIMS = [
  {
    eyebrow: 'Gestão de Consultório',
    title: 'Construído para escala.',
    text: 'Agenda, prontuário e financeiro em um fluxo contínuo, para você focar no paciente.',
  },
  {
    eyebrow: 'Inteligência Clínica',
    title: 'Sua IA residente.',
    text: 'Laudos de exames lidos em segundos, com biomarcadores interpretados e parecer estruturado.',
  },
  {
    eyebrow: 'Engajamento',
    title: 'Conexão direta com o paciente.',
    text: 'Portal exclusivo, ficha de pré-consulta digital e plano alimentar na palma da mão.',
  },
];

const TRUST = ['Isolado por clínica', 'Dados sob a LGPD', 'Suporte em português', 'Sem instalação'];

const CLAIM_INTERVAL_MS = 6000;

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const BrandPanel: React.FC = () => {
  // O vídeo só é montado onde o painel aparece (desktop) e quando o usuário
  // aceita movimento — evita baixar o MP4 no celular, onde o painel some.
  const showVideo = useMediaQuery('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setActive((i) => (i + 1) % CLAIMS.length), CLAIM_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <aside className="relative hidden w-[46%] shrink-0 overflow-hidden bg-slate-950 text-white lg:flex xl:w-1/2">
      {showVideo && (
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={HERO_VIDEO_URL} type="video/mp4" />
        </video>
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/70 to-slate-950"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_0%_100%,rgba(20,184,166,0.22),transparent_70%),radial-gradient(50%_40%_at_100%_0%,rgba(80,36,252,0.16),transparent_70%)]"
      />

      <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
        <Link
          to="/"
          className="self-start rounded-xl focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-950"
          aria-label="Nutri-AI — voltar para a página inicial"
        >
          <Wordmark light />
        </Link>

        <div className="max-w-lg">
          {/* Todas as frases ocupam a mesma célula do grid: a altura não pula na troca. */}
          <div className="grid" aria-live="off">
            {CLAIMS.map((claim, i) => {
              const isActive = i === active;
              return (
                <div
                  key={claim.eyebrow}
                  aria-hidden={!isActive}
                  className={`[grid-area:1/1] transition-[opacity,transform] duration-700 ease-out ${
                    isActive ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-950/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-300 backdrop-blur-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                    {claim.eyebrow}
                  </span>
                  <p className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight xl:text-5xl">
                    {claim.title}
                  </p>
                  <p className="mt-4 text-base leading-relaxed text-slate-300 xl:text-lg">{claim.text}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex gap-2" aria-hidden="true">
            {CLAIMS.map((claim, i) => (
              <span
                key={claim.eyebrow}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === active ? 'w-8 bg-teal-400' : 'w-3 bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-6 text-sm text-slate-300">
          {TRUST.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-400" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

export const AuthShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen bg-white font-sans selection:bg-teal-500/20">
    <BrandPanel />

    <div className="flex min-h-screen flex-1 flex-col">
      {/* Faixa de marca no celular/tablet — mesma linguagem escura da landing. */}
      <header className="relative overflow-hidden bg-slate-950 px-4 py-4 sm:px-6 lg:hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(70%_120%_at_0%_100%,rgba(20,184,166,0.25),transparent_70%)]"
        />
        <div className="relative flex items-center justify-between gap-3">
          <Link to="/" className="rounded-xl focus-visible:ring-2 focus-visible:ring-teal-400" aria-label="Nutri-AI — página inicial">
            <Wordmark light />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao site
          </Link>
        </div>
      </header>

      <div className="hidden justify-end px-10 pt-8 lg:flex">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao site
        </Link>
      </div>

      <div role="main" className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-14 lg:items-center lg:py-10">
        <div className="landing-rise w-full max-w-[400px]">{children}</div>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-6 text-xs text-slate-400">
        <span>© {new Date().getFullYear()} Nutri-AI</span>
        <Link to="/termos" className="transition-colors hover:text-slate-700">Termos de Serviço</Link>
        <Link to="/privacidade" className="transition-colors hover:text-slate-700">Privacidade</Link>
      </footer>
    </div>
  </div>
);
