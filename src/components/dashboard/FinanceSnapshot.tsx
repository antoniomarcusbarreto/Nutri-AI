import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useMonthPayments, useOverduePayments } from '../../hooks/queries/useFinance';
import { brl, inMonth, monthRefOf, sumCents, todayISO } from '../financial/financeModel';
import { Card } from '../ui';
import { ListSkeleton, LoadError, SectionTitle } from './dashboardUi';

/**
 * Caixa do mês em três números. Só recebimentos — despesas e resultado ficam
 * no Financeiro (e a secretária, que só recebe, não os vê).
 */
export const FinanceSnapshot: React.FC<{ clinicId?: string }> = ({ clinicId }) => {
  const today = todayISO();
  const ref = monthRefOf(new Date());
  const month = useMonthPayments(clinicId, ref);
  const overdue = useOverduePayments(clinicId, today);

  const payments = month.data ?? [];
  const paid = payments.filter((p) => p.status === 'pago' && inMonth(p.paid_at, ref));
  const dueToday = payments.filter((p) => p.status === 'pendente' && p.due_date === today);
  const late = overdue.data ?? [];
  const received = sumCents(paid.map((p) => p.net_amount));
  const toReceiveToday = sumCents(dueToday.map((p) => p.net_amount));
  const lateTotal = sumCents(late.map((p) => p.net_amount));

  const loading = month.isPending || overdue.isPending;
  const failed = month.isError || overdue.isError;

  return (
    <Card as="section" aria-labelledby="finance-title" className="flex flex-col">
      <SectionTitle
        id="finance-title"
        title="Financeiro"
        hint="Recebimentos deste mês"
        action={
          <Link to="/financeiro" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-[#5024fc] hover:bg-slate-100">
            Abrir <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      {loading ? (
        <ListSkeleton rows={3} height="h-14" />
      ) : failed ? (
        <LoadError message="Não foi possível carregar o financeiro." onRetry={() => { month.refetch(); overdue.refetch(); }} />
      ) : (
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
            <dt className="text-sm text-slate-600">
              Recebido no mês
              <span className="block text-xs text-slate-500">{paid.length} {paid.length === 1 ? 'pagamento' : 'pagamentos'}</span>
            </dt>
            <dd className={`text-2xl font-semibold tabular-nums ${received > 0 ? 'text-[#5024fc]' : 'text-slate-400'}`}>{brl(received)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
            <dt className="text-sm text-slate-600">
              Vence hoje
              <span className="block text-xs text-slate-500">{dueToday.length} {dueToday.length === 1 ? 'cobrança' : 'cobranças'}</span>
            </dt>
            <dd className={`text-lg font-medium tabular-nums ${toReceiveToday > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{brl(toReceiveToday)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 px-4 py-3.5">
            <dt className="text-sm text-slate-600">
              Vencido
              {late.length > 0 ? (
                <Link to="/financeiro?aba=recebimentos&filtro=vencidos" className="block text-xs font-medium text-rose-700 hover:underline">
                  {late.length} {late.length === 1 ? 'cobrança' : 'cobranças'} · cobrar
                </Link>
              ) : (
                <span className="block text-xs text-slate-500">Nada em atraso</span>
              )}
            </dt>
            <dd className={`text-lg font-medium tabular-nums ${late.length > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{brl(lateTotal)}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
};
