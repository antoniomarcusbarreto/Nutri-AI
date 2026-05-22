import React from 'react';
import { Link } from 'react-router-dom';
import { Apple, Calendar, Users, Activity, CheckCircle2, ArrowRight, Shield } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-primary-100 selection:text-primary-900">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <nav className="flex items-center justify-between p-6 lg:px-8 max-w-7xl mx-auto" aria-label="Global">
          <div className="flex lg:flex-1 items-center gap-3">
            <div className="h-10 w-10 bg-primary-100 rounded-xl flex items-center justify-center shadow-sm">
              <Apple className="h-6 w-6 text-primary-600" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">NutriAI</span>
          </div>
          <div className="flex flex-1 justify-end items-center gap-6">
            <Link to="/login" className="text-sm font-semibold leading-6 text-slate-700 hover:text-primary-600 transition-colors">
              Entrar
            </Link>
            <Link
              to="/login?mode=signup"
              className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 transition-all hover:scale-105"
            >
              Comece Grátis
            </Link>
          </div>
        </nav>
      </header>

      <main className="isolate pt-14">
        {/* Hero Section */}
        <div className="relative pt-14 lg:pt-24 pb-20 sm:pb-32 overflow-hidden">
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
            <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#99f6e4] to-[#14b8a6] opacity-30 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: 'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)' }}></div>
          </div>
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl mb-6">
                A revolução na gestão do seu <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">Consultório de Nutrição</span>
              </h1>
              <p className="mt-6 text-lg leading-8 text-slate-600">
                Agendamentos inteligentes, prontuários digitais avançados e gestão financeira simplificada. Tudo que você precisa para focar no que realmente importa: a saúde dos seus pacientes.
              </p>
              <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                to="/login?mode=signup"
                className="rounded-full bg-primary-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 hover:bg-primary-500 hover:shadow-xl hover:shadow-primary-500/40 transition-all hover:-translate-y-1"
              >
                Criar conta gratuita
              </Link>
                <a href="#features" className="text-sm font-semibold leading-6 text-slate-900 flex items-center gap-1 hover:text-primary-600 transition-colors">
                  Conheça os recursos <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-base font-semibold leading-7 text-primary-600">Solução Completa</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Tudo que um nutricionista moderno precisa
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
              {[
                {
                  name: 'Prontuário e Anamnese Dinâmica',
                  description: 'Registre as consultas de forma rápida e eficiente. Armazene dados antropométricos, histórico e metas com segurança.',
                  icon: Activity,
                },
                {
                  name: 'Agenda Inteligente',
                  description: 'Nunca mais perca um horário. Gestão de calendário intuitiva, com lembretes e organização de retornos ou novas consultas.',
                  icon: Calendar,
                },
                {
                  name: 'CRM de Pacientes',
                  description: 'Mantenha o relacionamento próximo. Veja o histórico completo, evolução de medidas e status de cada paciente num piscar de olhos.',
                  icon: Users,
                },
              ].map((feature) => (
                <div key={feature.name} className="flex flex-col bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-slate-900 mb-4">
                    <div className="h-12 w-12 flex flex-col items-center justify-center rounded-2xl bg-primary-50">
                      <feature.icon className="h-6 w-6 text-primary-600" aria-hidden="true" />
                    </div>
                    {feature.name}
                  </dt>
                  <dd className="flex flex-auto flex-col text-base leading-7 text-slate-600">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Pricing Section */}
        <div id="pricing" className="bg-slate-900 py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <h2 className="text-base font-semibold leading-7 text-primary-400">Preços Simples</h2>
              <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Escolha o plano ideal para a sua carreira
              </p>
            </div>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-slate-300">
              Teste gratuitamente por 14 dias sem compromisso. Cancele quando quiser.
            </p>
            <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:max-w-4xl lg:grid-cols-2 lg:gap-x-8">
              {/* Plan 1: Autônomo */}
              <div className="rounded-3xl p-8 xl:p-10 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition-colors">
                <div className="flex items-center justify-between gap-x-4">
                  <h3 className="text-lg font-semibold leading-8 text-white">Plano Autônomo (Individual)</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">Nutricionistas recém-formados ou que atendem sozinhos.</p>
                <p className="mt-6 flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight text-white">R$ 89,90</span>
                  <span className="text-sm font-semibold leading-6 text-slate-300">/mês</span>
                </p>
                <Link
                  to="/login?mode=signup&plan=starter"
                  className="mt-6 block rounded-full bg-white/10 px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  Começar teste grátis
                </Link>
                <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-slate-300">
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-primary-400" aria-hidden="true" />
                    Até 50 pacientes ativos no mês
                  </li>
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-primary-400" aria-hidden="true" />
                    1 Usuário (Apenas o nutricionista)
                  </li>
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-primary-400" aria-hidden="true" />
                    Recursos de IA Inclusos (limite de fotos/mês por paciente)
                  </li>
                </ul>
              </div>

              {/* Plan 2: Clínica / Equipe */}
              <div className="rounded-3xl p-8 xl:p-10 bg-gradient-to-b from-primary-600 to-primary-800 ring-2 ring-primary-400 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 blur-2xl rounded-full"></div>
                <div className="flex items-center justify-between gap-x-4">
                  <h3 className="text-lg font-semibold leading-8 text-white">Plano Clínica / Equipe</h3>
                  <span className="rounded-full bg-primary-400/20 px-2.5 py-1 text-xs font-semibold leading-5 text-primary-200 ring-1 ring-inset ring-primary-400/50">
                    Recomendado
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-primary-100">Clínicas, consultórios compartilhados ou alta rotatividade.</p>
                <p className="mt-6 flex items-baseline gap-x-1">
                  <span className="text-4xl font-bold tracking-tight text-white">R$ 249,90</span>
                  <span className="text-sm font-semibold leading-6 text-primary-100">/mês</span>
                </p>
                <Link
                  to="/login?mode=signup&plan=pro"
                  className="mt-6 block rounded-full bg-white px-3 py-2.5 text-center text-sm font-semibold text-primary-600 shadow-sm hover:bg-primary-50 transition-colors"
                >
                  Começar teste grátis
                </Link>
                <ul role="list" className="mt-8 space-y-3 text-sm leading-6 text-primary-100">
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-white" aria-hidden="true" />
                    Pacientes Ilimitados
                  </li>
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-white" aria-hidden="true" />
                    Até 3 profissionais/funcionários (Ex: 2 Nutris + 1 Sec.)
                  </li>
                  <li className="flex gap-x-3">
                    <CheckCircle2 className="h-6 w-5 flex-none text-white" aria-hidden="true" />
                    Recursos de IA Inclusos (maior cota de requisições)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Apple className="h-5 w-5 text-primary-600" />
            <span className="text-lg font-bold text-slate-900 tracking-tight">NutriAI</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Shield className="h-4 w-4" />
            <span>Dados protegidos e seguros (RLS Supabase)</span>
          </div>
          <p className="text-sm text-slate-500">&copy; {new Date().getFullYear()} NutriAI. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
};
