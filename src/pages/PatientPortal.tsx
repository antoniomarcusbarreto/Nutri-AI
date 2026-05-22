import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, User, FileText, CheckCircle } from 'lucide-react';

export const PatientPortal: React.FC = () => {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-primary-600 p-2 rounded-xl">
                <span className="text-white font-bold text-xl leading-none block">N</span>
              </div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">
                Nutri<span className="text-primary-600">AI</span> <span className="text-sm font-normal text-slate-500 ml-2">Portal do Paciente</span>
              </span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-700">Olá, {profile?.full_name?.split(' ')[0]}</span>
              <button
                onClick={signOut}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Seu Acompanhamento</h1>
          <p className="text-slate-500 mt-1">Acesse suas dietas, avaliações e registre suas refeições.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Plano Alimentar</h3>
              <p className="text-sm text-slate-500 mt-1">Sua dieta atualizada</p>
              <button className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700">Ver plano &rarr;</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-green-50 text-green-600 rounded-xl">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Diário Alimentar</h3>
              <p className="text-sm text-slate-500 mt-1">Registre suas refeições</p>
              <button className="mt-3 text-sm font-medium text-green-600 hover:text-green-700">Adicionar registro &rarr;</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Próxima Consulta</h3>
              <p className="text-sm text-slate-500 mt-1">Agendamentos</p>
              <button className="mt-3 text-sm font-medium text-purple-600 hover:text-purple-700">Ver detalhes &rarr;</button>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center">
          <User className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900">Bem-vindo ao novo portal!</h2>
          <p className="text-slate-500 max-w-md mx-auto mt-2">
            Estamos preparando novas funcionalidades para o seu acompanhamento nutricional. 
            Em breve você poderá visualizar sua evolução completa aqui.
          </p>
        </div>
      </main>
    </div>
  );
};
