import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useDeletePayment, useSetChargeCancelled, useUndoPayment } from '../../hooks/queries/useFinance';
import { cn } from '../../lib/cn';
import { Button, Card, ConfirmDialog, EmptyState } from '../ui';
import { EditChargeModal, RegisterPaymentModal } from './FinanceModals';
import { useIssueReceipt } from './useIssueReceipt';
import {
  brl,
  fmtDay,
  inMonth,
  METHOD_LABEL,
  paymentView,
  sumCents,
  VIEW_BADGE,
  whatsappReminderLink,
  type MonthRef,
  type PaymentRecord,
  type PaymentView,
} from './financeModel';

type Filter = 'todos' | 'a_receber' | 'vencidos' | 'pagos' | 'cancelados';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'a_receber', label: 'A receber' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'cancelados', label: 'Cancelados' },
];

const MATCH: Record<Exclude<Filter, 'todos' | 'vencidos'>, PaymentView[]> = {
  a_receber: ['a_receber', 'vencido'],
  pagos: ['pago'],
  cancelados: ['cancelado'],
};

export interface ReceivablesTabProps {
  month: MonthRef;
  payments: PaymentRecord[];
  overdue: PaymentRecord[];
  today: string;
  loading: boolean;
  readOnly: boolean;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
}

/**
 * Lista de cobranças do mês. "Vencidos" é a exceção: mostra TODAS as
 * pendências vencidas, de qualquer mês — é a lista de trabalho de cobrança.
 */
export const ReceivablesTab: React.FC<ReceivablesTabProps> = ({
  month, payments, overdue, today, loading, readOnly, filter, onFilterChange,
}) => {
  const { clinic, userRole } = useAuth();
  const { showToast } = useToast();
  const issueReceipt = useIssueReceipt();
  const undo = useUndoPayment();
  const setCancelled = useSetChargeCancelled();
  const remove = useDeletePayment();
  const canDelete = userRole === 'owner' || userRole === 'nutritionist';

  const [query, setQuery] = useState('');
  const [paying, setPaying] = useState<PaymentRecord | null>(null);
  const [editing, setEditing] = useState<PaymentRecord | null>(null);
  const [deleting, setDeleting] = useState<PaymentRecord | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Linhas do mês = vencimento no mês, ou pagas no mês (ex.: consulta de agosto paga em setembro).
  const monthRows = useMemo(
    () => payments.filter((p) => inMonth(p.due_date, month) || (p.status === 'pago' && inMonth(p.paid_at, month))),
    [payments, month],
  );

  const rows = useMemo(() => {
    const base = filter === 'vencidos'
      ? overdue
      : filter === 'todos'
        ? monthRows
        : monthRows.filter((p) => MATCH[filter].includes(paymentView(p, today)));
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const filtered = q
      ? base.filter((p) => `${p.patients?.name ?? ''} ${p.description}`.toLocaleLowerCase('pt-BR').includes(q))
      : base;
    return [...filtered].sort((a, b) => a.due_date.localeCompare(b.due_date) || (a.patients?.name ?? '').localeCompare(b.patients?.name ?? ''));
  }, [filter, overdue, monthRows, query, today]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todos: monthRows.length, a_receber: 0, vencidos: overdue.length, pagos: 0, cancelados: 0 };
    for (const p of monthRows) {
      const v = paymentView(p, today);
      if (v === 'pago') c.pagos++;
      else if (v === 'cancelado') c.cancelados++;
      else c.a_receber++;
    }
    return c;
  }, [monthRows, overdue, today]);

  const listTotal = sumCents(rows.filter((p) => p.status !== 'cancelado').map((p) => p.net_amount));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setOpenMenu(null);
    try {
      await fn();
      showToast(ok, 'success');
    } catch (err) {
      showToast(`Não foi possível concluir: ${(err as { message?: string })?.message ?? 'erro inesperado'}`, 'error');
    }
  };

  const overdueTotal = sumCents(overdue.map((p) => p.net_amount));

  return (
    <div className="space-y-4">
      {overdue.length > 0 && filter !== 'vencidos' && (
        <button
          type="button"
          onClick={() => onFilterChange('vencidos')}
          className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-left text-sm text-rose-800 hover:border-rose-200 cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="font-medium">{overdue.length} {overdue.length === 1 ? 'cobrança vencida' : 'cobranças vencidas'}</strong>
            {' '}somando {brl(overdueTotal)}, considerando todos os meses.
          </span>
          <span className="shrink-0 text-xs font-medium underline underline-offset-2">Ver lista</span>
        </button>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Filtrar cobranças">
          {FILTERS.map(({ id, label }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                  active ? 'bg-[#5024fc] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                {label}
                <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>
        <label className="relative block w-full lg:w-72">
          <span className="sr-only">Buscar por paciente ou serviço</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar paciente ou serviço"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-12 pr-3 text-sm text-slate-700 shadow-sm"
          />
        </label>
      </div>

      <Card padding="none" className="overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="space-y-2 p-5" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-200/60" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            size="sm"
            className="m-5"
            icon={<Wallet />}
            title={query ? 'Nada encontrado' : filter === 'vencidos' ? 'Nenhuma cobrança vencida' : 'Nenhuma cobrança neste mês'}
            description={
              query ? 'Tente outro nome ou serviço.'
                : filter === 'vencidos' ? 'Tudo em dia.'
                  : 'As consultas agendadas geram a cobrança automaticamente. Para algo fora da agenda, use "Lançar cobrança".'
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-slate-200/70">
              {rows.map((p) => {
                const view = paymentView(p, today);
                const badge = VIEW_BADGE[view];
                const wa = view === 'a_receber' || view === 'vencido' ? whatsappReminderLink(p, clinic?.name ?? '') : null;
                const menuOpen = openMenu === p.id;
                return (
                  <li key={p.id} className={cn('flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center', view === 'cancelado' && 'opacity-60')}>
                    <div className="w-20 shrink-0 text-sm text-slate-500 tabular-nums">
                      {fmtDay(p.due_date, 'dd/MM/yy')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{p.patients?.name ?? 'Paciente removido'}</p>
                      <p className="truncate text-xs text-slate-500">
                        {p.description}
                        {p.status === 'pago' && p.method && ` · ${METHOD_LABEL[p.method]} em ${fmtDay(p.paid_at, 'dd/MM')}`}
                        {!p.appointment_id && ' · avulsa'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:justify-end">
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', badge.className)}>
                        {badge.label}
                      </span>
                      <div className="w-28 text-right">
                        <p className={cn('text-sm font-medium tabular-nums text-slate-900', view === 'cancelado' && 'line-through')}>{brl(p.net_amount)}</p>
                        {p.discount > 0 && <p className="text-[11px] text-slate-500 tabular-nums">de {brl(p.amount)}</p>}
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
                        {(view === 'a_receber' || view === 'vencido') && !readOnly && (
                          <Button size="sm" onClick={() => setPaying(p)} leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                            Receber
                          </Button>
                        )}
                        {view === 'pago' && (
                          <Button size="sm" variant="secondary" onClick={() => issueReceipt(p)} leftIcon={<FileText className="h-3.5 w-3.5" />}>
                            Recibo
                          </Button>
                        )}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                            aria-label={`Lembrar ${p.patients?.name ?? 'paciente'} pelo WhatsApp`}
                            title="Lembrete pelo WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        {!readOnly && (
                          <div className="relative">
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              aria-label="Mais ações"
                              onClick={() => setOpenMenu(menuOpen ? null : p.id)}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {menuOpen && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} aria-hidden="true" />
                                <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-slate-200 bg-white bg-white-pure p-1 shadow-md">
                                  {p.status === 'pendente' && (
                                    <MenuItem icon={<Pencil />} onClick={() => { setOpenMenu(null); setEditing(p); }}>Editar valor ou data</MenuItem>
                                  )}
                                  {p.status === 'pago' && (
                                    <MenuItem icon={<RotateCcw />} onClick={() => run(() => undo.mutateAsync(p.id), 'Recebimento desfeito.')}>Desfazer recebimento</MenuItem>
                                  )}
                                  {p.status === 'pendente' && (
                                    <MenuItem icon={<Ban />} onClick={() => run(() => setCancelled.mutateAsync({ id: p.id, cancelled: true }), 'Cobrança cancelada.')}>Cancelar cobrança</MenuItem>
                                  )}
                                  {p.status === 'cancelado' && (
                                    <MenuItem icon={<RotateCcw />} onClick={() => run(() => setCancelled.mutateAsync({ id: p.id, cancelled: false }), 'Cobrança reaberta.')}>Reabrir cobrança</MenuItem>
                                  )}
                                  {canDelete && (
                                    <MenuItem danger icon={<Trash2 />} onClick={() => { setOpenMenu(null); setDeleting(p); }}>Excluir</MenuItem>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-200/70 bg-slate-50/60 px-5 py-3 text-sm">
              <span className="text-slate-500">{rows.length} {rows.length === 1 ? 'cobrança' : 'cobranças'}</span>
              <span className="text-slate-700">Total <span className="font-medium text-slate-900 tabular-nums">{brl(listTotal)}</span></span>
            </div>
          </>
        )}
      </Card>

      {paying && <RegisterPaymentModal key={paying.id} payment={paying} onClose={() => setPaying(null)} />}
      {editing && <EditChargeModal key={editing.id} payment={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => remove.mutateAsync(deleting.id), 'Cobrança excluída.').then(() => setDeleting(null))}
        confirming={remove.isPending}
        title="Excluir cobrança?"
        message={
          deleting?.appointment_id
            ? 'A cobrança some do financeiro, mas a consulta continua na agenda. Para só tirar do total, prefira "Cancelar cobrança".'
            : 'Esta cobrança avulsa será apagada definitivamente.'
        }
        confirmLabel="Excluir"
      />
    </div>
  );
};

const MenuItem: React.FC<{ icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ icon, onClick, danger, children }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={cn(
      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm cursor-pointer [&>svg]:h-4 [&>svg]:w-4',
      danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100',
    )}
  >
    {icon}
    {children}
  </button>
);

export type { Filter as ReceivablesFilter };
