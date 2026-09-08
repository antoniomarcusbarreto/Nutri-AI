import React from 'react';
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
  Clock,
  Sparkles,
} from 'lucide-react';

const CTA_LABEL = 'Começar teste grátis';

const ctaBase =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 font-semibold text-white shadow-sm shadow-primary-600/20 transition-[background-color,box-shadow,transform] duration-200 hover:bg-primary-500 hover:shadow-lg hover:shadow-primary-600/30 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2';
const ctaPrimary = `${ctaBase} px-6 py-3 text-sm`;
const ctaCompact = `${ctaBase} px-4 py-2 text-sm`;

const Wordmark: React.FC = () => (
  <span className="inline-flex items-center gap-2.5">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-600 text-lg font-bold leading-none text-white shadow-sm">
      N
    </span>
    <span className="text-xl font-bold tracking-tight text-slate-900">
      Nutri<span className="text-primary-600">AI</span>
    </span>
  </span>
);

const flow = [
  { icon: Calendar, label: 'Agenda', note: 'Confirmação por link' },
  { icon: ClipboardList, label: 'Prontuário', note: 'Anamnese e antropometria' },
  { icon: Salad, label: 'Plano alimentar', note: 'Montado e compartilhado' },
  { icon: FlaskConical, label: 'Exames', note: 'Laudo lido pela IA' },
  { icon: RefreshCw, label: 'Retorno', note: 'Evolução acompanhada' },
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
];

const trust = [
  {
    icon: ShieldCheck,
    title: 'Isolado por clínica',
    body: 'Cada clínica só enxerga os próprios pacientes. Erro de permissão é falha visível — nunca vazamento silencioso entre contas.',
  },
  {
    icon: Lock,
    title: 'LGPD de verdade',
    body: 'Consentimento registrado e exclusão real dos dados do paciente quando ele pede. Dado sensível de saúde tratado como tal.',
  },
  {
    icon: Clock,
    title: 'Sem pegadinha no 15º dia',
    body: 'Avisamos antes de o teste acabar. Você decide continuar — nada é cobrado sem o seu aval e sem cartão cadastrado.',
  },
];

const biomarkers = [
  { name: 'TSH', value: '5,8', unit: 'µUI/mL', ref: '0,4–4,0', status: 'Alto', tone: 'critical' },
  { name: 'Ferritina', value: '14', unit: 'ng/mL', ref: '15–150', status: 'Baixa', tone: 'critical' },
  { name: 'Vitamina D', value: '22', unit: 'ng/mL', ref: '30–100', status: 'Insuficiente', tone: 'warning' },
  { name: 'Glicemia', value: '89', unit: 'mg/dL', ref: '70–99', status: 'Normal', tone: 'ok' },
];

const biomarkersSample = [
  { name: 'Hemoglobina', value: '11,8', unit: 'g/dL', ref: '12,0–15,5', status: 'Baixa', tone: 'critical' },
  { name: 'Colesterol LDL', value: '162', unit: 'mg/dL', ref: '< 130', status: 'Alto', tone: 'critical' },
  { name: 'Vitamina B12', value: '210', unit: 'pg/mL', ref: '200–900', status: 'Limítrofe', tone: 'warning' },
  { name: 'HbA1c', value: '5,4', unit: '%', ref: '< 5,7', status: 'Normal', tone: 'ok' },
];

const toneClass: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 ring-rose-200',
  warning: 'bg-amber-100 text-amber-800 ring-amber-200',
  ok: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
};

const ExamAIMock: React.FC = () => (
  <figure className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
    <figcaption className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-500">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight text-slate-900">
          Assistente de IA Nutricional
        </span>
        <span className="block text-xs leading-tight text-slate-500">Parecer gerado a partir do laudo</span>
      </span>
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        Exemplo
      </span>
    </figcaption>

    <div className="divide-y divide-slate-100">
      {biomarkers.map((b, i) => (
        <div
          key={b.name}
          className={`${i >= 2 ? 'hidden sm:flex' : 'flex'} items-center gap-3 px-5 py-3`}
        >
          <span className="flex-1">
            <span className="block text-sm font-medium text-slate-900">{b.name}</span>
            <span className="block text-xs text-slate-500">
              {b.value} {b.unit} · ref. {b.ref}
            </span>
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClass[b.tone]}`}
          >
            {b.status}
          </span>
        </div>
      ))}
    </div>

    <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prioridade clínica</p>
      <p className="text-sm leading-6 text-slate-700">
        Eixo tireoidiano primeiro: investigar anti-TPO, reforçar iodo e selênio. Repor ferro junto de
        vitamina C; expor ao sol e considerar suplementação de vitamina D.
      </p>
      <p className="pt-1 text-xs text-slate-500">
        Extraído do laudo · comparado com a referência · nunca estimado
      </p>
    </div>
  </figure>
);

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
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-100 selection:text-primary-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-slate-50/80 backdrop-blur-md">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8"
          aria-label="Navegação principal"
        >
          <Link
            to="/"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
          >
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="#fluxo"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline-block"
            >
              Recursos
            </a>
            <a
              href="#pricing"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 sm:inline-block"
            >
              Planos
            </a>
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Entrar
            </Link>
            <Link to="/login?mode=signup" className={`${ctaCompact} ml-1`}>
              {CTA_LABEL}
            </Link>
          </div>
        </nav>
      </header>

      <div role="main">
        {/* Hero */}
        <section className="relative isolate overflow-hidden px-6 pb-20 pt-16 sm:pb-24 sm:pt-20 lg:px-8">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-[-10rem] h-[36rem] w-[68rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(45,212,191,0.22),rgba(45,212,191,0))] blur-2xl" />
            <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(13,148,136,0.08)_1px,transparent_1.5px)] [background-size:26px_26px] [mask-image:radial-gradient(40rem_26rem_at_50%_4rem,#000,transparent)]" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-300/60 to-transparent" />
          </div>

          <div className="mx-auto grid max-w-7xl items-start gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="mx-auto max-w-xl text-center landing-rise lg:mx-0 lg:text-left">
              <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">
                O consultório de nutrição,{' '}
                <span className="bg-gradient-to-r from-primary-800 to-primary-600 bg-clip-text text-transparent">
                  inteiro em um só lugar
                </span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                Agenda, prontuário, planos alimentares, análise de exames por IA e financeiro
                conversando entre si — em português, sem costurar planilha com WhatsApp.
              </p>
              <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row lg:justify-start">
                <Link to="/login?mode=signup" className={`${ctaPrimary} w-full sm:w-auto`}>
                  {CTA_LABEL}
                </Link>
                <a
                  href="#fluxo"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-primary-700"
                >
                  Ver todos os recursos <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                14 dias grátis · sem cartão de crédito · cancele quando quiser
              </p>
              <ul className="mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 lg:justify-start">
                {['Sem instalação', 'Suporte em português', 'Dados sob a LGPD'].map((chip) => (
                  <li key={chip} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-primary-500" aria-hidden="true" />
                    {chip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mx-auto max-w-md landing-rise landing-rise-late lg:mx-0 lg:pt-2">
              <ExamAIMock />
              <p className="mt-3 text-center text-xs text-slate-500">
                Um laudo lido pela IA em segundos — exemplo ilustrativo.
              </p>
            </div>
          </div>
        </section>

        {/* Fluxo + recursos */}
        <section id="fluxo" className="scroll-mt-24 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Do agendamento ao retorno, sem trocar de ferramenta
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Não é um CRM genérico adaptado nem seis assinaturas separadas. Este é o ciclo
                clínico completo — e em volta dele, o financeiro e o portal do paciente andam junto.
              </p>
            </div>

            {/* trilha */}
            <ol className="relative mx-auto mt-14 flex max-w-4xl flex-wrap justify-center gap-x-6 gap-y-8 sm:grid sm:grid-cols-5">
              <div
                aria-hidden="true"
                className="absolute left-[10%] right-[10%] top-6 hidden h-px bg-slate-200 sm:block"
              />
              {flow.map((step) => (
                <li key={step.label} className="relative flex w-28 flex-col items-center text-center sm:w-auto">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-primary-100 bg-white text-primary-600 shadow-sm">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="mt-3 text-sm font-semibold text-slate-900">{step.label}</span>
                  <span className="mt-1 text-xs leading-5 text-slate-500">{step.note}</span>
                </li>
              ))}
            </ol>

            {/* assinatura em destaque */}
            <article className="mt-16 flex flex-col gap-8 rounded-3xl border border-primary-200 bg-primary-50/50 p-7 sm:p-9 lg:flex-row lg:items-center">
              <div className="lg:max-w-md">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-100 text-primary-700">
                    <FlaskConical className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white">
                    Análise por IA
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-slate-900">Análise de exames por IA</h3>
                <p className="mt-2 text-base leading-7 text-slate-600">
                  O laudo em PDF ou foto vira biomarcadores extraídos, comparados com a referência e um
                  parecer de conduta — nunca estimados.
                </p>
              </div>
              <ul className="flex-1 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-primary-100 bg-white">
                {biomarkersSample.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-slate-900">{b.name}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {b.value} {b.unit} · ref. {b.ref}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneClass[b.tone]}`}
                    >
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            {/* demais módulos */}
            <ul className="mx-auto mt-6 grid max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2 md:max-w-none lg:grid-cols-3">
              {features.map((feature) => (
                <li
                  key={feature.name}
                  className="flex flex-col rounded-3xl border border-slate-200/70 bg-white p-7 transition-[border-color,box-shadow] duration-200 hover:border-primary-200 hover:shadow-lg"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                    <feature.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">{feature.name}</h3>
                  <p className="mt-2 text-base leading-7 text-slate-600">{feature.description}</p>
                </li>
              ))}
            </ul>

            <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-6 text-slate-600">
              E o paciente tem portal próprio: preenche a ficha de pré-consulta pelo link que você
              envia e acompanha o plano alimentar sem nunca acessar o seu painel clínico.
            </p>
          </div>
        </section>

        {/* Confiança */}
        <section className="bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Feito para dados sensíveis de saúde
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Prontuário e exame não são planilha. O produto trata isso como obrigação, não
                como recurso opcional.
              </p>
            </div>
            <dl className="mt-12 grid grid-cols-1 divide-y divide-slate-200/70 overflow-hidden rounded-3xl border border-slate-200/70 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {trust.map((item) => (
                <div key={item.title} className="p-7">
                  <dt className="flex flex-col gap-3 text-base font-semibold text-slate-900">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                      <item.icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    {item.title}
                  </dt>
                  <dd className="mt-3 text-sm leading-6 text-slate-600">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-24 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Um preço simples para cada fase da carreira
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Teste gratuitamente por 14 dias, sem compromisso.
              </p>
            </div>

            <div className="mx-auto mt-14 grid max-w-md grid-cols-1 gap-6 lg:max-w-4xl lg:grid-cols-2">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    'relative flex flex-col rounded-3xl p-8 xl:p-10 ' +
                    (plan.highlighted
                      ? 'bg-primary-700 text-white shadow-xl ring-1 ring-primary-500'
                      : 'border border-slate-200 bg-white')
                  }
                >
                  <div className="flex items-center justify-between gap-x-3">
                    <h3 className={'text-lg font-semibold ' + (plan.highlighted ? 'text-white' : 'text-slate-900')}>
                      {plan.name}
                    </h3>
                    {plan.highlighted && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary-700">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className={'mt-3 text-sm leading-6 ' + (plan.highlighted ? 'text-primary-100' : 'text-slate-600')}>
                    {plan.audience}
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className={'text-4xl font-bold tracking-tight ' + (plan.highlighted ? 'text-white' : 'text-slate-900')}>
                      {plan.price}
                    </span>
                    <span className={'text-sm font-semibold ' + (plan.highlighted ? 'text-primary-100' : 'text-slate-500')}>
                      /mês
                    </span>
                  </p>
                  <Link
                    to={plan.to}
                    className={
                      'mt-6 block rounded-full px-3 py-2.5 text-center text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
                      (plan.highlighted
                        ? 'bg-white text-primary-700 hover:bg-primary-50 focus-visible:ring-white focus-visible:ring-offset-primary-700'
                        : 'bg-primary-600 text-white hover:bg-primary-500 focus-visible:ring-primary-600')
                    }
                  >
                    {CTA_LABEL}
                  </Link>
                  <ul className={'mt-8 space-y-3 text-sm leading-6 ' + (plan.highlighted ? 'text-primary-50' : 'text-slate-600')}>
                    {plan.features.map((item) => (
                      <li key={item} className="flex gap-x-3">
                        <CheckCircle2
                          className={'h-5 w-5 flex-none ' + (plan.highlighted ? 'text-white' : 'text-primary-600')}
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
              Mais de 3 profissionais?{' '}
              <Link to="/login?mode=signup&plan=pro" className="font-semibold text-primary-700 hover:text-primary-600">
                Fale com a gente
              </Link>{' '}
              — montamos o plano da sua clínica. Cobrança mensal, sem fidelidade.
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-slate-50 px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-4xl rounded-3xl bg-primary-600 px-6 py-14 text-center sm:px-12 sm:py-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Sua próxima consulta pode já estar no NutriAI
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-primary-50">
              Criar a conta leva dois minutos. 14 dias grátis, sem cartão de crédito.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                to="/login?mode=signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary-700 shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-primary-50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-600"
              >
                Criar minha conta <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <Wordmark />
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck className="h-4 w-4 flex-none text-primary-600" aria-hidden="true" />
            <span>Dados de saúde protegidos, isolados por clínica e sob a LGPD.</span>
          </div>
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} NutriAI. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};
