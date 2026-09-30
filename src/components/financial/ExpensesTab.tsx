import React, { useMemo, useState } from 'react';
import { Check, Pencil, Receipt, Repeat, Trash2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useDeleteExpense, useToggleExpensePaid } from '../../hooks/queries/useFinance';
import { cn } from '../../lib/cn';
import { Button, Card, EmptyState, Modal } from '../ui';
import { ExpenseModal } from './FinanceModals';
import {
  brl,
  CATEGORY_LABEL,
  fmtDay,
  inMonth,
  sumCents,
  todayISO,
  type ExpenseRecord,
  type MonthRef,
} from './financeModel';

export interface ExpensesTabProps {
  month: MonthRef;
  expenses: ExpenseRecord[];
  loading: boolean;
  readOnly: boolean;
  onNew: () => void;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ month, expenses, loading, readOnly, onNew }) => {
  const { showToast } = useToast();
  const toggle = useToggleExpensePaid();
  const remove = useDeleteExpense();
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [deleting, setDeleting] = useState<ExpenseRecord | null>(null);
  const today = todayISO();

  // Aba lista o que VENCE no mês; pagas no mês mas vencidas antes aparecem no mês do vencimento.
  const rows = useMemo(
    () => expenses.filter((e) => inMonth(e.due_date, month)).sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [expenses, month],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of rows) map.set(e.category, sumCents([map.get(e.category) ?? 0, e.amount]));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const total = sumCents(rows.map((e) => e.amount));
  const pending = sumCents(rows.filter((e) => e.status === 'pendente').map((e) => e.amount));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, 'success');
    } catch (err) {
      showToast(`Não foi possível concluir: ${(err as { message?: string })?.message ?? 'erro inesperado'}`, 'error');
    }
  };

  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        icon={<Receipt />}
        title="Nenhuma despesa neste mês"
        description="Lance aluguel, assinaturas, impostos e o que mais sair do caixa. Contas fixas podem se repetir todo mês."
        action={!readOnly && <Button onClick={onNew}>Nova despesa</Button>}
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-slate-200/70">
          {rows.map((e) => {
            const late = e.status === 'pendente' && e.due_date < today;
            return (
              <li key={e.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
                <div className="w-20 shrink-0 text-sm text-slate-500 tabular-nums">{fmtDay(e.due_date, 'dd/MM/yy')}</div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                    {e.description}
                    {e.series_id && <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Despesa mensal" />}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {CATEGORY_LABEL[e.category]}
                    {e.status === 'pago' && ` · paga em ${fmtDay(e.paid_at, 'dd/MM')}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    e.status === 'pago' ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      : late ? 'bg-rose-50 text-rose-700 border-rose-100'
                        : 'bg-amber-50 text-amber-700 border-amber-100',
                  )}>
                    {e.status === 'pago' ? 'Paga' : late ? 'Atrasada' : 'A pagar'}
                  </span>
                  <p className="w-28 text-right text-sm font-medium text-slate-900 tabular-nums">{brl(e.amount)}</p>
                  {!readOnly && (
                    <div className="ml-auto flex items-center gap-1 sm:ml-0">
                      <button
                        type="button"
                        onClick={() => run(
                          () => toggle.mutateAsync({ id: e.id, paid_at: e.status === 'pago' ? null : today }),
                          e.status === 'pago' ? 'Despesa marcada como a pagar.' : 'Despesa paga.',
                        )}
                        aria-label={e.status === 'pago' ? 'Marcar como a pagar' : 'Marcar como paga hoje'}
                        title={e.status === 'pago' ? 'Marcar como a pagar' : 'Marcar como paga hoje'}
                        className={cn(
                          'rounded-lg p-2 cursor-pointer',
                          e.status === 'pago' ? 'text-emerald-700 hover:bg-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setEditing(e)} aria-label="Editar despesa" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setDeleting(e)} aria-label="Excluir despesa" className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 cursor-pointer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 bg-slate-50/60 px-5 py-3 text-sm">
          <span className="text-slate-500">{pending > 0 ? `${brl(pending)} ainda a pagar` : 'Tudo pago'}</span>
          <span className="text-slate-700">Total <span className="font-medium text-slate-900 tabular-nums">{brl(total)}</span></span>
        </div>
      </Card>

      <Card padding="sm" as="section" aria-labelledby="exp-cat-title" className="h-fit">
        <h2 id="exp-cat-title" className="text-sm font-semibold text-slate-900">Por categoria</h2>
        <ul className="mt-3 space-y-3">
          {byCategory.map(([cat, value]) => (
            <li key={cat}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{CATEGORY_LABEL[cat as ExpenseRecord['category']]}</span>
                <span className="shrink-0 text-slate-900 tabular-nums">{brl(value)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                <div className="h-full rounded-full bg-[#eb6834]" style={{ width: `${total ? Math.max(4, (value / total) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {editing && <ExpenseModal key={editing.id} open expense={editing} onClose={() => setEditing(null)} />}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="sm"
        title="Excluir despesa?"
        description={deleting ? `${deleting.description} · ${brl(deleting.amount)} · ${fmtDay(deleting.due_date)}` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancelar</Button>
          {deleting?.series_id && (
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => run(() => remove.mutateAsync({ expense: deleting, scope: 'following' }), 'Despesa e meses seguintes excluídos.').then(() => setDeleting(null))}
            >
              Este e os próximos
            </Button>
          )}
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => deleting && run(() => remove.mutateAsync({ expense: deleting, scope: 'one' }), 'Despesa excluída.').then(() => setDeleting(null))}
          >
            {deleting?.series_id ? 'Só este mês' : 'Excluir'}
          </Button>
        </>}
      >
        <p className="text-sm text-slate-600">
          {deleting?.series_id
            ? 'Esta despesa se repete todo mês. Escolha se quer apagar só este lançamento ou também os meses seguintes.'
            : 'O lançamento será apagado definitivamente.'}
        </p>
      </Modal>
    </div>
  );
};
