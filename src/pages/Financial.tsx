import React from 'react';
import { DollarSign } from 'lucide-react';

export const Financial: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
          <p className="mt-1 text-sm text-slate-500">
            Acompanhe os balanços financeiros com base nos seus atendimentos.
          </p>
        </div>
        <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
          <DollarSign className="h-6 w-6 text-primary-600" />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <DollarSign className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">Em desenvolvimento</h3>
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
          Em breve você poderá gerenciar receitas, despesas e emitir recibos diretamente por aqui.
        </p>
      </div>
    </div>
  );
};
