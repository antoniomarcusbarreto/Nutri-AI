import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText } from 'lucide-react';
import { useAppointmentPayment } from '../../hooks/queries/useFinance';
import { cn } from '../../lib/cn';
import { Button } from '../ui';
import { RegisterPaymentModal } from './FinanceModals';
import { useIssueReceipt } from './useIssueReceipt';
import { brl, fmtDay, METHOD_LABEL, monthParam, paymentView, todayISO, VIEW_BADGE } from './financeModel';

/**
 * Bloco "Pagamento" no detalhe do agendamento: situação da cobrança gerada
 * automaticamente + receber / recibo sem sair da Agenda.
 */
export const AppointmentPaymentBlock: React.FC<{ appointmentId: string; readOnly: boolean }> = ({ appointmentId, readOnly }) => {
  const { data: payment, isLoading } = useAppointmentPayment(appointmentId);
  const issueReceipt = useIssueReceipt();
  const [paying, setPaying] = useState(false);

  if (isLoading) return <div className="h-16 animate-pulse rounded-xl bg-slate-200/60" aria-busy="true" />;
  if (!payment) {
    return <p className="text-xs text-slate-500">Sem cobrança vinculada a esta consulta.</p>;
  }

  const view = paymentView(payment, todayISO());
  const badge = VIEW_BADGE[view];
  const [y, m] = payment.due_date.split('-').map(Number);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/55 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums text-slate-900">{brl(payment.net_amount)}</span>
          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', badge.className)}>{badge.label}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {view === 'pago' && payment.method
            ? `${METHOD_LABEL[payment.method]} em ${fmtDay(payment.paid_at)}`
            : <Link to={`/financeiro?aba=recebimentos&mes=${monthParam({ year: y, month: m - 1 })}`} className="underline underline-offset-2 hover:text-slate-800">Ver no financeiro</Link>}
        </p>
      </div>
      {(view === 'a_receber' || view === 'vencido') && !readOnly && (
        <Button size="sm" onClick={() => setPaying(true)} leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}>Registrar pagamento</Button>
      )}
      {view === 'pago' && (
        <Button size="sm" variant="secondary" onClick={() => issueReceipt(payment)} leftIcon={<FileText className="h-3.5 w-3.5" />}>Recibo</Button>
      )}
      {paying && <RegisterPaymentModal key={payment.id} payment={payment} onClose={() => setPaying(false)} />}
    </div>
  );
};
