import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Printer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalMealPlan } from '../../hooks/queries/usePortal';
import { MealPlanView } from '../../components/mealplan/MealPlanView';
import { Button } from '../../components/ui';
import { PortalPageHeader } from '../../components/portal/PortalPageHeader';

export const PortalPlan: React.FC = () => {
  const { patientPortal } = useAuth();
  const plan = usePortalMealPlan(patientPortal?.patient_id);

  return (
    <>
      <PortalPageHeader
        title="Plano alimentar"
        description={plan.data ? (
          <>
            Atualizado em {format(new Date(plan.data.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            {plan.data.kcal ? <> · <span className="tabular-nums">{plan.data.kcal}</span> kcal/dia</> : null}
          </>
        ) : undefined}
        actions={plan.data ? (
          <Button variant="secondary" size="sm" className="print:hidden" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Imprimir
          </Button>
        ) : undefined}
      />

      {plan.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-200/60" />)}
        </div>
      ) : plan.isError ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Não foi possível carregar seu plano. Tente mais tarde.</p>
      ) : plan.data ? (
        <>
          <p className="text-sm text-slate-600">Cada refeição tem opções equivalentes: escolha a que combina com o seu dia.</p>
          <MealPlanView meals={plan.data.meals} className="grid grid-cols-1 items-start gap-5 space-y-0 xl:grid-cols-2" />
        </>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          Seu plano ainda não foi publicado. Assim que {patientPortal?.nutritionist_name || 'seu nutricionista'} montar, ele aparece aqui.
        </p>
      )}
    </>
  );
};
