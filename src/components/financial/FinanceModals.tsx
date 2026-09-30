import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { usePatients } from '../../hooks/queries/usePatients';
import {
  useCreateCharge,
  useCreateExpense,
  useRegisterPayment,
  useUpdateCharge,
  useUpdateExpense,
} from '../../hooks/queries/useFinance';
import { Button, Input, Modal, Select, Textarea } from '../ui';
import {
  brl,
  CATEGORY_LABEL,
  fmtDay,
  METHOD_LABEL,
  moneyInput,
  parseMoney,
  todayISO,
  type ExpenseCategory,
  type ExpenseRecord,
  type PaymentMethod,
  type PaymentRecord,
} from './financeModel';

const METHODS = Object.entries(METHOD_LABEL) as [PaymentMethod, string][];
const CATEGORIES = Object.entries(CATEGORY_LABEL) as [ExpenseCategory, string][];

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'Erro inesperado.';

/** Linha "rótulo … valor" do resumo de totais dos formulários. */
const TotalRow: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500">{label}</span>
    <span className={strong ? 'text-base font-semibold text-slate-900 tabular-nums' : 'text-slate-700 tabular-nums'}>{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Registrar pagamento
// ---------------------------------------------------------------------------

export const RegisterPaymentModal: React.FC<{ payment: PaymentRecord | null; onClose: () => void }> = ({ payment, onClose }) => {
  const { showToast } = useToast();
  const register = useRegisterPayment();
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [paidAt, setPaidAt] = useState(todayISO);
  const [discount, setDiscount] = useState(() => (payment?.discount ? moneyInput(payment.discount) : ''));
  const [notes, setNotes] = useState(payment?.notes ?? '');

  if (!payment) return null;
  const discountValue = discount.trim() ? parseMoney(discount) : 0;
  const discountError =
    Number.isNaN(discountValue) || discountValue < 0 ? 'Valor inválido.'
      : discountValue > payment.amount ? 'O desconto não pode passar do valor.' : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (discountError) return;
    try {
      await register.mutateAsync({ id: payment.id, method, paid_at: paidAt, discount: discountValue, notes: notes.trim() || null });
      showToast('Pagamento registrado.', 'success');
      onClose();
    } catch (err) {
      showToast(`Não foi possível registrar: ${errorMessage(err)}`, 'error');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pagamento"
      description={`${payment.patients?.name ?? 'Paciente'} · ${payment.description} · ${fmtDay(payment.due_date)}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="register-payment-form" loading={register.isPending}>Confirmar recebimento</Button>
      </>}
    >
      <form id="register-payment-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Forma de pagamento" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} required>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="Data do pagamento" type="date" value={paidAt} max={todayISO()} onChange={(e) => setPaidAt(e.target.value)} required />
        </div>
        <Input
          label="Desconto (R$)"
          inputMode="decimal"
          placeholder="0,00"
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          error={discountError}
        />
        <Textarea label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
        <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <TotalRow label="Valor da cobrança" value={brl(payment.amount)} />
          {discountValue > 0 && !discountError && <TotalRow label="Desconto" value={`− ${brl(discountValue)}`} />}
          <TotalRow label="Total recebido" value={brl(discountError ? payment.amount : payment.amount - discountValue)} strong />
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Editar cobrança (ainda não paga)
// ---------------------------------------------------------------------------

export const EditChargeModal: React.FC<{ payment: PaymentRecord | null; onClose: () => void }> = ({ payment, onClose }) => {
  const { showToast } = useToast();
  const update = useUpdateCharge();
  const [description, setDescription] = useState(payment?.description ?? '');
  const [amount, setAmount] = useState(payment ? moneyInput(payment.amount) : '');
  const [discount, setDiscount] = useState(payment?.discount ? moneyInput(payment.discount) : '');
  const [dueDate, setDueDate] = useState(payment?.due_date ?? todayISO());
  const [notes, setNotes] = useState(payment?.notes ?? '');

  if (!payment) return null;
  const amountValue = parseMoney(amount);
  const discountValue = discount.trim() ? parseMoney(discount) : 0;
  const amountError = Number.isNaN(amountValue) || amountValue < 0 ? 'Informe um valor válido.' : undefined;
  const discountError =
    Number.isNaN(discountValue) || discountValue < 0 ? 'Valor inválido.'
      : !amountError && discountValue > amountValue ? 'O desconto não pode passar do valor.' : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountError || discountError || !description.trim()) return;
    try {
      await update.mutateAsync({
        id: payment.id,
        description: description.trim(),
        amount: amountValue,
        discount: discountValue,
        due_date: dueDate,
        notes: notes.trim() || null,
      });
      showToast('Cobrança atualizada.', 'success');
      onClose();
    } catch (err) {
      showToast(`Não foi possível salvar: ${errorMessage(err)}`, 'error');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar cobrança"
      description={payment.patients?.name ?? undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="edit-charge-form" loading={update.isPending}>Salvar</Button>
      </>}
    >
      <form id="edit-charge-form" onSubmit={submit} className="space-y-4">
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError} required />
          <Input label="Desconto (R$)" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} error={discountError} />
          <Input label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
        {payment.appointment_id && (
          <p className="text-xs text-slate-500">
            Esta cobrança está ligada a um agendamento. Se a consulta for reagendada, o vencimento acompanha a nova data.
          </p>
        )}
        <Textarea label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Lançar cobrança avulsa (sem agendamento)
// ---------------------------------------------------------------------------

interface ServiceOption { id: string; name: string; price: number }

export const NewChargeModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { clinic, profile, userRole } = useAuth();
  const { showToast } = useToast();
  const create = useCreateCharge();
  const { data: patients = [] } = usePatients(clinic?.id, { enabled: open });
  const { data: services = [] } = useQuery({
    queryKey: ['services', 'list', clinic?.id ?? 'none'],
    enabled: open && !!clinic?.id,
    queryFn: async (): Promise<ServiceOption[]> => {
      const { data, error } = await supabase.from('services').select('id, name, price').eq('clinic_id', clinic!.id).order('name');
      if (error) throw error;
      return ((data ?? []) as ServiceOption[]).map((s) => ({ ...s, price: Number(s.price) }));
    },
  });

  const [patientId, setPatientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(todayISO);
  const [alreadyPaid, setAlreadyPaid] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');

  const activePatients = useMemo(() => patients.filter((p) => p.status === 'ativo'), [patients]);

  const reset = () => {
    setPatientId(''); setServiceId(''); setDescription(''); setAmount('');
    setDueDate(todayISO()); setAlreadyPaid(true); setMethod('pix'); setNotes('');
  };
  const close = () => { reset(); onClose(); };

  const pickService = (id: string) => {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    if (s) {
      setDescription(s.name);
      setAmount(moneyInput(s.price));
    }
  };

  const amountValue = parseMoney(amount);
  const amountError = amount && (Number.isNaN(amountValue) || amountValue < 0) ? 'Informe um valor válido.' : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic?.id || !patientId || !description.trim() || Number.isNaN(amountValue) || amountValue < 0) return;
    try {
      await create.mutateAsync({
        clinic_id: clinic.id,
        patient_id: patientId,
        service_id: serviceId || null,
        // Secretária não é o profissional do recibo; os demais assinam o próprio lançamento.
        nutritionist_id: userRole === 'secretary' ? null : profile?.id ?? null,
        description: description.trim(),
        amount: amountValue,
        discount: 0,
        due_date: dueDate,
        notes: notes.trim() || null,
        paid: alreadyPaid ? { method, paid_at: dueDate > todayISO() ? todayISO() : dueDate } : null,
      });
      showToast(alreadyPaid ? 'Recebimento lançado.' : 'Cobrança lançada.', 'success');
      close();
    } catch (err) {
      showToast(`Não foi possível lançar: ${errorMessage(err)}`, 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Lançar cobrança"
      description="Para atendimentos fora da agenda, consultas antigas ou vendas avulsas. Consultas agendadas geram a cobrança sozinhas."
      footer={<>
        <Button variant="secondary" onClick={close}>Cancelar</Button>
        <Button type="submit" form="new-charge-form" loading={create.isPending}>Lançar</Button>
      </>}
    >
      <form id="new-charge-form" onSubmit={submit} className="space-y-4">
        <Select label="Paciente" value={patientId} onChange={(e) => setPatientId(e.target.value)} required>
          <option value="">Selecione…</option>
          {activePatients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Serviço" hint="Preenche descrição e valor" value={serviceId} onChange={(e) => pickService(e.target.value)}>
            <option value="">Nenhum (avulso)</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} · {brl(s.price)}</option>)}
          </Select>
          <Input label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError} required />
        </div>
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Retorno, bioimpedância" required />
        <Input label={alreadyPaid ? 'Data' : 'Vencimento'} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />

        <label className="flex items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#5024fc] focus:ring-[#5024fc]" />
          Já foi pago
        </label>
        {alreadyPaid && (
          <Select label="Forma de pagamento" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        )}
        <Textarea label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Despesa (nova ou edição)
// ---------------------------------------------------------------------------

export const ExpenseModal: React.FC<{ open: boolean; expense?: ExpenseRecord | null; onClose: () => void }> = ({ open, expense, onClose }) => {
  const { clinic } = useAuth();
  const { showToast } = useToast();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const editing = !!expense;

  const [description, setDescription] = useState(expense?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'aluguel');
  const [amount, setAmount] = useState(expense ? moneyInput(expense.amount) : '');
  const [dueDate, setDueDate] = useState(expense?.due_date ?? todayISO());
  const [paid, setPaid] = useState(expense ? expense.status === 'pago' : false);
  const [paidAt, setPaidAt] = useState(expense?.paid_at ?? todayISO());
  const [repeat, setRepeat] = useState(false);
  const [repeatMonths, setRepeatMonths] = useState('12');
  const [notes, setNotes] = useState(expense?.notes ?? '');

  const amountValue = parseMoney(amount);
  const amountError = amount && (Number.isNaN(amountValue) || amountValue <= 0) ? 'Informe um valor maior que zero.' : undefined;
  const months = Math.min(36, Math.max(2, Number(repeatMonths) || 2));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinic?.id || !description.trim() || Number.isNaN(amountValue) || amountValue <= 0) return;
    const base = {
      description: description.trim(),
      category,
      amount: amountValue,
      due_date: dueDate,
      paid_at: paid ? paidAt : null,
      notes: notes.trim() || null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: expense!.id, ...base });
        showToast('Despesa atualizada.', 'success');
      } else {
        await create.mutateAsync({ clinic_id: clinic.id, ...base, repeatMonths: repeat ? months : 1 });
        showToast(repeat ? `Despesa lançada para ${months} meses.` : 'Despesa lançada.', 'success');
      }
      onClose();
    } catch (err) {
      showToast(`Não foi possível salvar: ${errorMessage(err)}`, 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar despesa' : 'Nova despesa'}
      description={editing && expense?.series_id ? 'Faz parte de uma série mensal. A edição vale só para este mês.' : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="expense-form" loading={create.isPending || update.isPending}>Salvar</Button>
      </>}
    >
      <form id="expense-form" onSubmit={submit} className="space-y-4">
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel da sala" required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Categoria" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Input label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} error={amountError} required />
        </div>
        <Input label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#5024fc] focus:ring-[#5024fc]" />
            Já foi paga
          </label>
          {paid && (
            <Input label="Data do pagamento" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
          )}
          {!editing && (
            <>
              <label className="flex items-center gap-2.5 text-sm text-slate-700">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#5024fc] focus:ring-[#5024fc]" />
                Repetir todo mês
              </label>
              {repeat && (
                <Input
                  label="Por quantos meses"
                  type="number"
                  min={2}
                  max={36}
                  value={repeatMonths}
                  onChange={(e) => setRepeatMonths(e.target.value)}
                  hint={paid ? 'Só o primeiro mês nasce pago; os seguintes ficam a pagar.' : 'Cada mês vira um lançamento a pagar.'}
                />
              )}
            </>
          )}
        </div>
        <Textarea label="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </form>
    </Modal>
  );
};
