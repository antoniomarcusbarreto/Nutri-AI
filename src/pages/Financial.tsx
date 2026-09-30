import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  useCashflowHistory,
  useMonthExpenses,
  useMonthPayments,
  useOverduePayments,
} from '../hooks/queries/useFinance';
import { cn } from '../lib/cn';
import { Button, PageHeader } from '../components/ui';
import { OverviewTab } from '../components/financial/OverviewTab';
import { ReceivablesTab, type ReceivablesFilter } from '../components/financial/ReceivablesTab';
import { ExpensesTab } from '../components/financial/ExpensesTab';
import { ExpenseModal, NewChargeModal } from '../components/financial/FinanceModals';
import {
  buildCsv,
  downloadText,
  monthLabel,
  monthParam,
  monthRefOf,
  parseMonthParam,
  shiftMonth,
  summarizeMonth,
  todayISO,
  type ExpenseRecord,
  type MonthRef,
  type PaymentRecord,
} from '../components/financial/financeModel';

type Tab = 'visao' | 'recebimentos' | 'despesas';

const TABS: { id: Tab; label: string; clinicalOnly: boolean }[] = [
  { id: 'visao', label: 'Visão do mês', clinicalOnly: true },
  { id: 'recebimentos', label: 'Recebimentos', clinicalOnly: false },
  { id: 'despesas', label: 'Despesas', clinicalOnly: true },
];

const FILTERS: ReceivablesFilter[] = ['todos', 'a_receber', 'vencidos', 'pagos', 'cancelados'];
const EMPTY_P: PaymentRecord[] = [];
const EMPTY_E: ExpenseRecord[] = [];

const MonthNav: React.FC<{ month: MonthRef; onChange: (m: MonthRef) => void; isCurrent: boolean }> = ({ month, onChange, isCurrent }) => (
  <div className="flex items-center gap-2" role="group" aria-label="Mês">
    <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
      <button type="button" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mês anterior" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9rem] px-2 text-center text-sm font-medium capitalize text-slate-800" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button type="button" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Próximo mês" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
    {!isCurrent && (
      <button type="button" onClick={() => onChange(monthRefOf(new Date()))} className="rounded-lg px-2 py-1.5 text-xs font-medium text-[#5024fc] hover:bg-indigo-50 cursor-pointer">
        Mês atual
      </button>
    )}
  </div>
);

/**
 * Financeiro do consultório.
 *
 * Mês, aba e filtro ficam na URL (`?mes=2026-09&aba=recebimentos&filtro=vencidos`).
 * A secretária vê só Recebimentos (decisão de produto — e a RLS de `expenses`
 * já não devolve nada para ela).
 */
export const Financial: React.FC = () => {
  const { clinic, userRole, isReadOnly } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(todayISO);
  const [newCharge, setNewCharge] = useState(false);
  const [newExpense, setNewExpense] = useState(false);

  const isClinical = userRole === 'owner' || userRole === 'nutritionist';
  const tabs = TABS.filter((t) => isClinical || !t.clinicalOnly);

  const month = parseMonthParam(searchParams.get('mes'), new Date());
  const prevMonth = shiftMonth(month, -1);
  const isCurrentMonth = monthParam(month) === monthParam(monthRefOf(new Date()));
  const tabParam = searchParams.get('aba') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === tabParam) ? tabParam! : tabs[0].id;
  const filterParam = searchParams.get('filtro') as ReceivablesFilter | null;
  const filter: ReceivablesFilter = filterParam && FILTERS.includes(filterParam) ? filterParam : 'todos';

  const setParam = (updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  };

  const payments = useMonthPayments(clinic?.id, month);
  const prevPayments = useMonthPayments(isClinical ? clinic?.id : undefined, prevMonth);
  const overdue = useOverduePayments(clinic?.id, today);
  const expenses = useMonthExpenses(clinic?.id, month, { enabled: isClinical });
  const prevExpenses = useMonthExpenses(clinic?.id, prevMonth, { enabled: isClinical });
  const history = useCashflowHistory(clinic?.id, month, 6, { enabled: isClinical && tab === 'visao' });

  const paymentRows = payments.data ?? EMPTY_P;
  const expenseRows = expenses.data ?? EMPTY_E;

  const summary = useMemo(() => summarizeMonth(paymentRows, expenseRows, month, today), [paymentRows, expenseRows, month, today]);
  const previous = useMemo(
    () => summarizeMonth(prevPayments.data ?? EMPTY_P, prevExpenses.data ?? EMPTY_E, prevMonth, today),
    [prevPayments.data, prevExpenses.data, prevMonth, today],
  );

  const exportCsv = () => {
    if (paymentRows.length === 0 && expenseRows.length === 0) {
      showToast('Não há lançamentos neste mês para exportar.', 'info');
      return;
    }
    downloadText(`financeiro-${monthParam(month)}.csv`, buildCsv(paymentRows, expenseRows, today));
  };

  const error = payments.error ?? expenses.error ?? overdue.error;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Financeiro"
        description={isClinical ? 'Recebimentos, despesas e o resultado do mês.' : 'Cobranças dos atendimentos e registro de pagamentos.'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isClinical && (
              <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
                Exportar CSV
              </Button>
            )}
            {!isReadOnly && tab === 'despesas' && (
              <Button onClick={() => setNewExpense(true)} leftIcon={<Plus className="h-4 w-4" />}>Nova despesa</Button>
            )}
            {!isReadOnly && tab !== 'despesas' && (
              <Button onClick={() => setNewCharge(true)} leftIcon={<Plus className="h-4 w-4" />}>Lançar cobrança</Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {tabs.length > 1 ? (
          <div role="tablist" aria-label="Seções do financeiro" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`fin-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="fin-panel"
                onClick={() => setParam({ aba: t.id, filtro: null })}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                  tab === t.id ? 'bg-[#5024fc] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : <span />}
        <MonthNav month={month} isCurrent={isCurrentMonth} onChange={(m) => setParam({ mes: monthParam(m) })} />
      </div>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Não foi possível carregar o financeiro: {(error as { message?: string }).message ?? 'erro inesperado'}.
        </p>
      )}

      <div id="fin-panel" role="tabpanel" aria-labelledby={`fin-tab-${tab}`}>
        {tab === 'visao' && (
          <OverviewTab summary={summary} previous={previous} history={history.data ?? []} />
        )}
        {tab === 'recebimentos' && (
          <ReceivablesTab
            month={month}
            payments={paymentRows}
            overdue={overdue.data ?? EMPTY_P}
            today={today}
            loading={payments.isLoading}
            readOnly={isReadOnly}
            filter={filter}
            onFilterChange={(f) => setParam({ filtro: f === 'todos' ? null : f })}
          />
        )}
        {tab === 'despesas' && (
          <ExpensesTab
            month={month}
            expenses={expenseRows}
            loading={expenses.isLoading}
            readOnly={isReadOnly}
            onNew={() => setNewExpense(true)}
          />
        )}
      </div>

      <NewChargeModal open={newCharge} onClose={() => setNewCharge(false)} />
      {newExpense && <ExpenseModal open onClose={() => setNewExpense(false)} />}
    </div>
  );
};
