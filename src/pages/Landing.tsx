import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ClipboardList,
  Salad,
  FlaskConical,
  RefreshCw,
  TrendingUp,
  Wallet,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { Button } from '../components/ui';

const CTA_LABEL = 'Começar teste grátis';

const ctaBase =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 font-semibold text-white shadow-sm shadow-primary-600/20 transition-[background-color,box-shadow,transform] duration-200 hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-600/30 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const ctaCompact = `${ctaBase} px-4 py-2 text-sm`;

const Wordmark: React.FC<{ light?: boolean }> = ({ light = false }) => (
  <span className="inline-flex items-center gap-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-600 text-lg font-bold leading-none text-white shadow-sm shadow-teal-500/30">
      N
    </span>
    <span className={`text-xl font-bold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
      Nutri<span className={light ? 'text-teal-400' : 'text-teal-600'}>AI</span>
    </span>
  </span>
);

const HERO_PANELS = [
  {
    eyebrow: 'Gestão de Consultório',
    title: 'Construído para escala.',
    subtitle:
      'Agenda inteligente, prontuário eletrônico completo e controle financeiro integrados em um fluxo contínuo para você focar no paciente.',
    cta: 'Explorar recursos',
    to: '#recursos',
    isAnchor: true,
  },
  {
    eyebrow: 'Inteligência Clínica',
    title: 'Sua IA residente.',
    subtitle:
      'Leitura automatizada de laudos de exames em PDF, interpretação de biomarcadores e pareceres clínicos estruturados em poucos segundos.',
    cta: 'Ver os planos',
    to: '#pricing',
    isAnchor: true,
  },
  {
    eyebrow: 'Engajamento',
    title: 'Conexão direta com o paciente.',
    subtitle:
      'Portal web e mobile exclusivo, ficha de pré-consulta digital e planos alimentares interativos com substituições na palma da mão.',
    cta: 'Começar agora',
    to: '/login?mode=signup',
    isAnchor: false,
  },
];

const flow = [
  { icon: Calendar, label: 'Agenda', note: 'Confirmação por link' },
  { icon: ClipboardList, label: 'Prontuário', note: 'Anamnese e antropometria' },
  { icon: Salad, label: 'Plano alimentar', note: 'Montado e compartilhado' },
  { icon: FlaskConical, label: 'Exames', note: 'Laudo lido pela IA' },
  { icon: RefreshCw, label: 'Retorno', note: 'Evolução acompanhada' },
];

const trustStrip = [
  'Isolado por clínica',
  'Dados sob a LGPD',
  'Suporte em português',
  'Sem instalação',
];

const features = [
  {
    name: 'Prontuário e anamnese',
    description:
      'Registro rápido da consulta: histórico, dados antropométricos, metas e evolução — versionados e sob a LGPD.',
    icon: ClipboardList,
  },
  {
    name: 'Agenda e retornos',
    description:
      'Calendário com confirmação por link, lembretes e controle de quem já deveria ter voltado.',
    icon: Calendar,
  },
  {
    name: 'Planos alimentares',
    description:
      'Monte o plano, ajuste refeição por refeição e compartilhe com o paciente por um link público.',
    icon: Salad,
  },
  {
    name: 'Evolução do paciente',
    description:
      'Peso, medidas e adesão em gráficos que você lê em voz alta durante a consulta.',
    icon: TrendingUp,
  },
  {
    name: 'Financeiro do consultório',
    description:
      'Serviços, recebimentos e a visão do mês sem precisar abrir a planilha de novo.',
    icon: Wallet,
  },
  {
    name: 'LGPD',
    description:
      'Consentimento registrado e exclusão real dos dados do paciente quando ele pede. Dado sensível de saúde tratado como tal.',
    icon: Lock,
  },
];

const plans = [
  {
    name: 'Autônomo',
    audience: 'Para quem atende sozinho e está começando.',
    price: 'R$ 89,90',
    to: '/login?mode=signup&plan=starter',
    highlighted: false,
    features: [
      'Até 50 pacientes ativos no mês',
      '1 usuário (apenas o nutricionista)',
      'Recursos de IA inclusos (cota mensal por paciente)',
    ],
  },
  {
    name: 'Clínica / Equipe',
    audience: 'Para clínicas, consultórios compartilhados ou alta rotatividade.',
    price: 'R$ 249,90',
    to: '/login?mode=signup&plan=pro',
    highlighted: true,
    features: [
      'Pacientes ilimitados',
      'Até 3 profissionais (ex.: 2 nutris + 1 secretária)',
      'Recursos de IA com cota estendida',
      'Papéis e isolamento de dados por clínica',
    ],
  },
];

export const Landing: React.FC = () => {
  const [activePanel, setActivePanel] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActivePanel((prev) => (prev + 1) % HERO_PANELS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 font-sans selection:bg-teal-500/20 selection:text-teal-400">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/60 backdrop-blur-md">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"
          aria-label="Navegação principal"
        >
          <Link
            to="/"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2"
          >
            <Wordmark light />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#recursos"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white sm:inline-block"
            >
              Recursos
            </a>
            <a
              href="#pricing"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white sm:inline-block"
            >
              Planos
            </a>
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:text-white"
            >
              Entrar
            </Link>
            <Link to="/login?mode=signup" className={`${ctaCompact} ml-1`}>
              {CTA_LABEL}
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Full Screen com Vídeo de Fundo e Painéis Cinemáticos (Preservado) */}
      <section className="relative h-screen w-full min-h-[620px] overflow-hidden flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8">
        {/* Vídeo de fundo */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source
            src="https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/45567745-d826-44a2-a5ce-7ef670944e60.mp4"
            type="video/mp4"
          />
        </video>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/65 to-slate-900"
        />

        {/* Vinheta radial sutil */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.3)_100%)]"
        />

        {/* Container dos Painéis Rotativos */}
        <div className="relative z-10 mx-auto w-full max-w-5xl text-center">
          <div className="relative flex min-h-[380px] sm:min-h-[340px] md:min-h-[300px] items-center justify-center">
            {HERO_PANELS.map((panel, index) => {
              const isActive = activePanel === index;
              return (
                <div
                  key={panel.eyebrow}
                  className={`flex flex-col items-center justify-center transition-all duration-1000 ease-in-out ${
                    isActive
                      ? 'relative z-10 translate-y-0 opacity-100'
                      : 'pointer-events-none absolute inset-0 z-0 translate-y-4 opacity-0'
                  }`}
                >
                  {/* Eyebrow em teal uppercase */}
                  <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-950/50 px-3.5 py-1.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.12em] text-teal-400 shadow-md backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" aria-hidden="true" />
                    {panel.eyebrow}
                  </div>

                  {/* Título Display */}
                  <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl leading-[1.08] drop-shadow-sm">
                    {panel.title}
                  </h1>

                  {/* Subtítulo */}
                  <p className="mt-6 max-w-2xl text-base sm:text-lg md:text-xl text-slate-200 leading-relaxed font-normal">
                    {panel.subtitle}
                  </p>

                  {/* Botões reutilizando o primitivo Button */}
                  <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:mt-10">
                    {panel.isAnchor ? (
                      <a href={panel.to}>
                        <Button
                          size="md"
                          className="!rounded-full !bg-teal-600 px-7 py-3.5 text-sm sm:text-base font-semibold !text-white shadow-lg shadow-teal-950/50 transition-all duration-200 hover:scale-105 hover:!bg-teal-500"
                        >
                          {panel.cta}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </a>
                    ) : (
                      <Link to={panel.to}>
                        <Button
                          size="md"
                          className="!rounded-full !bg-teal-600 px-7 py-3.5 text-sm sm:text-base font-semibold !text-white shadow-lg shadow-teal-950/50 transition-all duration-200 hover:scale-105 hover:!bg-teal-500"
                        >
                          {panel.cta}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </Link>
                    )}

                    <Link
                      to="/login?mode=signup"
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm sm:text-base font-semibold text-white backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/20 hover:-translate-y-0.5"
                    >
                      {CTA_LABEL}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Indicadores de painel com controle interativo */}
          <div className="mt-10 flex items-center justify-center gap-3">
            {HERO_PANELS.map((p, idx) => (
              <button
                key={p.eyebrow}
                type="button"
                onClick={() => setActivePanel(idx)}
                className={`group relative h-2.5 rounded-full transition-all duration-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                  activePanel === idx
                    ? 'w-10 bg-teal-400 shadow-md shadow-teal-400/50'
                    : 'w-2.5 bg-white/30 hover:bg-white/60'
                }`}
                aria-label={`Ir para painel ${idx + 1}: ${p.eyebrow}`}
                aria-current={activePanel === idx ? 'true' : 'false'}
              />
            ))}
          </div>

          <p className="mt-5 text-xs font-medium text-slate-300">
            14 dias grátis · sem cartão de crédito · cancele quando quiser
          </p>
        </div>
      </section>

      {/* Seção 1: Recursos (bg-gradient-to-b from-slate-900 to-[#606f84]) */}
      <section id="recursos" className="scroll-mt-20 bg-gradient-to-b from-slate-900 to-[#606f84] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Faixa de Confiança */}
          <div className="mb-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 backdrop-blur-md">
            {trustStrip.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-medium text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden="true" />
                {item}
              </div>
            ))}
          </div>

          {/* Cabeçalho de Recursos */}
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-950/50 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-teal-400">
              O ciclo clínico completo
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Do agendamento ao retorno, em uma única plataforma
            </h2>
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-slate-300">
              Sem ferramentas fragmentadas ou planilhas improvisadas. Prontuário, exames com IA,
              planos alimentares e financeiro conectados no mesmo lugar.
            </p>
          </div>

          {/* Trilha do Ciclo Clínico */}
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {flow.map((step, i) => (
              <div
                key={step.label}
                className="group relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all duration-200 hover:border-teal-500/40 hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-400">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold text-teal-400/80">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <span className="mt-1 text-sm font-semibold text-white">{step.label}</span>
                <span className="text-xs leading-relaxed text-slate-300">{step.note}</span>
              </div>
            ))}
          </div>

          {/* Grade de Recursos (6 Cards - Retângulo 2x3) */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <article
                key={feature.name}
                className="flex flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all duration-200 hover:border-teal-500/30 hover:bg-white/10"
              >
                <div>
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 p-2.5 text-teal-400">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-white">{feature.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{feature.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Seção 2: Planos / Preços (bg-gradient-to-b from-[#606f84] to-[#c1c9d2]) */}
      <section id="pricing" className="scroll-mt-20 bg-gradient-to-b from-[#606f84] to-[#c1c9d2] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-teal-300 backdrop-blur-md">
              Planos Transparentes
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Um preço simples para cada fase da sua carreira
            </h2>
            <p className="mt-4 text-base sm:text-lg text-slate-300">
              Teste gratuitamente por 14 dias. Sem fidelidade e sem necessidade de cartão de crédito.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-md grid-cols-1 items-stretch gap-8 lg:max-w-4xl lg:grid-cols-2">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={
                  'relative flex flex-col justify-between rounded-3xl bg-slate-900 p-8 sm:p-10 shadow-2xl transition-all duration-200 text-white ' +
                  (plan.highlighted
                    ? 'border-2 border-teal-500/50 ring-2 ring-teal-400/50 shadow-teal-500/10'
                    : 'border border-slate-700 hover:border-slate-600')
                }
              >
                <div>
                  <div className="flex items-center justify-between gap-x-3">
                    <h3 className="text-xl font-bold text-white">
                      {plan.name}
                    </h3>
                    {plan.highlighted && (
                      <span className="rounded-full bg-teal-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-950 shadow-sm">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300">
                    {plan.audience}
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                      {plan.price}
                    </span>
                    <span className="text-sm font-semibold text-slate-400">
                      /mês
                    </span>
                  </p>

                  <Link
                    to={plan.to}
                    className={
                      'mt-8 block rounded-full py-3.5 text-center text-sm sm:text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
                      (plan.highlighted
                        ? 'bg-teal-400 text-slate-950 hover:bg-teal-300 shadow-lg shadow-teal-400/20 focus-visible:ring-teal-400'
                        : 'bg-teal-600 text-white hover:bg-teal-500 shadow-md shadow-teal-900/40 focus-visible:ring-teal-600')
                    }
                  >
                    {CTA_LABEL}
                  </Link>

                  <ul className="mt-8 space-y-3.5 text-sm leading-6 text-slate-300">
                    {plan.features.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <CheckCircle2
                          className="h-5 w-5 shrink-0 text-teal-400"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-12 max-w-2xl text-center text-sm text-slate-900 font-medium">
            Mais de 3 profissionais na sua equipe?{' '}
            <Link
              to="/login?mode=signup&plan=pro"
              className="font-semibold text-teal-700 underline underline-offset-4 hover:text-teal-800"
            >
              Fale com a gente
            </Link>{' '}
              — montamos o plano ideal para a sua clínica.
          </p>
        </div>
      </section>

      {/* Seção 3: CTA (bg-gradient-to-b from-[#c1c9d2] to-[#f8fafc]) */}
      <section className="bg-gradient-to-b from-[#c1c9d2] to-[#f8fafc] py-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-br from-teal-800 via-teal-700 to-teal-900 px-6 py-14 text-center shadow-2xl sm:px-12 sm:py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Sua próxima consulta pode já estar no NutriAI
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base sm:text-lg leading-relaxed text-teal-100">
            Criar a conta leva apenas dois minutos. 14 dias de teste grátis, sem cartão de crédito.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              to="/login?mode=signup"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm sm:text-base font-semibold text-teal-950 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-teal-50 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-teal-800"
            >
              Criar minha conta <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer (bg-[#f8fafc]) */}
      <footer className="border-t border-slate-200 bg-[#f8fafc] py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 md:flex-row md:items-center md:justify-between sm:px-6 lg:px-8">
          <Wordmark />
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="h-4 w-4 flex-none text-teal-600" aria-hidden="true" />
            <span>Dados de saúde protegidos, isolados por clínica e sob a LGPD.</span>
          </div>
          <p className="text-sm text-slate-600">
            &copy; {new Date().getFullYear()} NutriAI. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

