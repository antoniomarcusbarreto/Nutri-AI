import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Apple } from 'lucide-react';

export const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 bg-primary-100 rounded-full flex items-center justify-center">
              <Apple className="h-5 w-5 text-primary-600" />
            </div>
            <span className="text-xl font-bold text-slate-900">NutriAI</span>
          </div>
          <Link 
            to="/login?mode=signup" 
            className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-primary-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar para o Cadastro
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-8">Termos de Serviço</h1>
          
          <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
            <p className="mb-8">
              Bem-vindo à nossa plataforma de gestão e saúde nutricional. Ao criar uma conta e utilizar nossos serviços, você concorda explicitamente com os termos descritos abaixo.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Objeto do Serviço</h2>
            <p className="mb-6">
              Nossa plataforma oferece ferramentas de software para a administração de consultórios de nutrição, agendamento de consultas, criação de planos alimentares e um ecossistema integrado para pacientes, incluindo ferramentas de inteligência artificial (IA) para análise de refeições.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Responsabilidade do Profissional (Nutricionista)</h2>
            <p className="mb-6">
              O uso da plataforma é exclusivo para profissionais devidamente registrados em seus respectivos conselhos profissionais (CRN). O nutricionista é o único responsável técnico pelas condutas, diagnósticos, planos alimentares e orientações fornecidas aos seus pacientes através do sistema.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Isenção de Responsabilidade sobre a Inteligência Artificial (IA)</h2>
            <p className="mb-4">
              A funcionalidade de identificação de alimentos por foto e sugestão de receitas baseia-se em modelos preditivos de inteligência artificial e atua estritamente como uma ferramenta de apoio e estimativa auxiliar.
            </p>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li>O usuário (profissional e paciente) reconhece que a IA pode cometer erros de identificação ou cálculo de porções.</li>
              <li>As informações geradas pela IA não substituem, em hipótese alguma, o julgamento do nutricionista ou o rótulo nutricional dos alimentos.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Planos, Assinaturas e Período de Teste</h2>
            <p className="mb-6">
              A plataforma oferece um período de teste gratuito. Após o término, a continuidade do acesso dependerá da escolha e pagamento de um plano de assinatura. Reservamo-nos o direito de bloquear o acesso em caso de inadimplência ou violação dos limites de uso de cada plano (como número de pacientes e usuários).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
