import React from 'react';
import { DollarSign } from 'lucide-react';
import { PageHeader, EmptyState } from '../components/ui';

export const Financial: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Financeiro"
        description="Acompanhe os balanços financeiros com base nos seus atendimentos."
        actions={
          <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-primary-600" />
          </div>
        }
      />

      <EmptyState
        icon={<DollarSign />}
        title="Em desenvolvimento"
        description="Em breve você poderá gerenciar receitas, despesas e emitir recibos diretamente por aqui."
      />
    </div>
  );
};
