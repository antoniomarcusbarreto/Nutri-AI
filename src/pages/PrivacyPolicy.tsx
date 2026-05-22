import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Apple } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
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
          <h1 className="text-3xl font-extrabold text-slate-900 mb-8">Política de Privacidade</h1>
          
          <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
            <p className="mb-8">
              Sua privacidade e a segurança dos seus dados de saúde são nossa prioridade absoluta. Esta política explica como coletamos, usamos e protegemos as informações de nutricionistas e pacientes, em total conformidade com a LGPD (Lei Geral de Proteção de Dados).
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">1. Dados Coletados</h2>
            <ul className="list-disc pl-6 mb-6 space-y-2">
              <li><strong>Dos Profissionais:</strong> Nome, e-mail, registro profissional (CRN), senha e dados de faturamento.</li>
              <li><strong>Dos Pacientes:</strong> Nome, e-mail, telefone, histórico clínico (anamnese), dados antropométricos (peso, medidas), planos alimentares e imagens de refeições enviadas para análise.</li>
            </ul>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">2. Uso dos Dados e Tratamento por Inteligência Artificial</h2>
            <p className="mb-6">
              Os dados coletados são utilizados estritamente para o funcionamento das funcionalidades do sistema. As fotos de pratos enviadas pelos pacientes são processadas via API de inteligência artificial de forma segura para fins exclusivos de identificação de ingredientes e macronutrientes daquela refeição. Não comercializamos, sob nenhuma hipótese, dados de saúde ou informações pessoais com terceiros.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">3. Segurança e Armazenamento</h2>
            <p className="mb-6">
              Todos os dados são armazenados em infraestrutura de nuvem altamente segura (Supabase), contando com criptografia, controle estrito de acesso e isolamento lógico de dados por meio de políticas de Row Level Security (RLS) no banco de dados. Um profissional nunca terá acesso aos dados de pacientes de outro consultório.
            </p>

            <h2 className="text-xl font-bold text-slate-900 mt-8 mb-4">4. Direitos dos Usuários</h2>
            <p className="mb-6">
              A qualquer momento, tanto o nutricionista quanto o paciente podem solicitar o acesso, retificação ou a exclusão definitiva de seus dados pessoais da plataforma, conforme garantido pela legislação vigente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
