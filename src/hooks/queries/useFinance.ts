import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import {
  monthParam,
  monthRange,
  shiftMonth,
  type ExpenseCategory,
  type ExpenseRecord,
  type MonthRef,
  type PaymentMethod,
  type PaymentRecord,
} from '../../components/financial/financeModel';

/**
 * Dados do módulo Financeiro. Toda escrita invalida a raiz `['finance']` —
 * o volume por clínica é pequeno e isso mantém visão do mês, listas e o
 * bloco de pagamento da Agenda sempre coerentes entre si.
 */

const PAYMENT_SELECT =
  '*, patients ( name, cpf, phone ), profiles!payments_nutritionist_id_fkey ( full_name, crn )';

// PostgREST pode devolver `numeric` como string dependendo da configuração.
const normalizePayment = (row: PaymentRecord): PaymentRecord => ({
  ...row,
  amount: Number(row.amount),
  discount: Number(row.discount),
  net_amount: Number(row.net_amount),
});

const normalizeExpense = (row: ExpenseRecord): ExpenseRecord => ({ ...row, amount: Number(row.amount) });

/** Cobranças que vencem OU foram pagas no mês (a visão do mês precisa das duas). */
export function useMonthPayments(clinicId: string | undefined, ref: MonthRef) {
  return useQuery({
    queryKey: qk.finance.payments(clinicId ?? 'none', monthParam(ref)),
    enabled: !!clinicId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PaymentRecord[]> => {
      const { start, end } = monthRange(ref);
      const { data, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('clinic_id', clinicId!)
        .or(`and(due_date.gte.${start},due_date.lte.${end}),and(paid_at.gte.${start},paid_at.lte.${end})`)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PaymentRecord[]).map(normalizePayment);
    },
  });
}

/** Todas as cobranças pendentes já vencidas, de qualquer mês. */
export function useOverduePayments(clinicId: string | undefined, today: string) {
  return useQuery({
    queryKey: qk.finance.overdue(clinicId ?? 'none', today),
    enabled: !!clinicId,
    queryFn: async (): Promise<PaymentRecord[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('clinic_id', clinicId!)
        .eq('status', 'pendente')
        .lt('due_date', today)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as PaymentRecord[]).map(normalizePayment);
    },
  });
}

/** Despesas que vencem OU foram pagas no mês. Só owner/nutritionist (RLS). */
export function useMonthExpenses(clinicId: string | undefined, ref: MonthRef, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.finance.expenses(clinicId ?? 'none', monthParam(ref)),
    enabled: !!clinicId && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ExpenseRecord[]> => {
      const { start, end } = monthRange(ref);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('clinic_id', clinicId!)
        .or(`and(due_date.gte.${start},due_date.lte.${end}),and(paid_at.gte.${start},paid_at.lte.${end})`)
        .order('due_date', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ExpenseRecord[]).map(normalizeExpense);
    },
  });
}

export interface CashflowPoint {
  key: string;
  ref: MonthRef;
  received: number;
  expenses: number;
}

/** Recebido × despesas pagas nos `months` meses que terminam em `ref` (regime de caixa). */
export function useCashflowHistory(clinicId: string | undefined, ref: MonthRef, months = 6, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...qk.finance.history(clinicId ?? 'none', monthParam(ref)), months],
    enabled: !!clinicId && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CashflowPoint[]> => {
      const first = shiftMonth(ref, -(months - 1));
      const start = monthRange(first).start;
      const end = monthRange(ref).end;
      const [pay, exp] = await Promise.all([
        supabase.from('payments').select('net_amount, paid_at')
          .eq('clinic_id', clinicId!).eq('status', 'pago')
          .gte('paid_at', start).lte('paid_at', end),
        supabase.from('expenses').select('amount, paid_at')
          .eq('clinic_id', clinicId!).eq('status', 'pago')
          .gte('paid_at', start).lte('paid_at', end),
      ]);
      if (pay.error) throw pay.error;
      if (exp.error) throw exp.error;

      const points: CashflowPoint[] = Array.from({ length: months }, (_, i) => {
        const r = shiftMonth(first, i);
        return { key: monthParam(r), ref: r, received: 0, expenses: 0 };
      });
      const byKey = new Map(points.map((p) => [p.key, p]));
      for (const row of (pay.data ?? []) as { net_amount: number; paid_at: string }[]) {
        const p = byKey.get(row.paid_at.slice(0, 7));
        if (p) p.received = Math.round((p.received + Number(row.net_amount)) * 100) / 100;
      }
      for (const row of (exp.data ?? []) as { amount: number; paid_at: string }[]) {
        const p = byKey.get(row.paid_at.slice(0, 7));
        if (p) p.expenses = Math.round((p.expenses + Number(row.amount)) * 100) / 100;
      }
      return points;
    },
  });
}

/** A cobrança de um agendamento (bloco "Pagamento" da Agenda). */
export function useAppointmentPayment(appointmentId: string | undefined) {
  return useQuery({
    queryKey: qk.finance.byAppointment(appointmentId ?? 'none'),
    enabled: !!appointmentId,
    queryFn: async (): Promise<PaymentRecord | null> => {
      const { data, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('appointment_id', appointmentId!)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizePayment(data as PaymentRecord) : null;
    },
  });
}

// ---------------------------------------------------------------------------
// Escritas
// ---------------------------------------------------------------------------

const useFinanceMutation = <V,>(fn: (vars: V) => Promise<void>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.finance.all }),
  });
};

const check = ({ error }: { error: unknown }) => {
  if (error) throw error;
};

export interface RegisterPaymentInput {
  id: string;
  method: PaymentMethod;
  paid_at: string;
  discount: number;
  notes: string | null;
}

export const useRegisterPayment = () =>
  useFinanceMutation<RegisterPaymentInput>(async ({ id, ...fields }) => {
    check(await supabase.from('payments').update({ ...fields, status: 'pago' }).eq('id', id));
  });

/** Desfaz o recebimento (volta a pendente). */
export const useUndoPayment = () =>
  useFinanceMutation<string>(async (id) => {
    check(await supabase.from('payments').update({ status: 'pendente', paid_at: null, method: null }).eq('id', id));
  });

export interface UpdateChargeInput {
  id: string;
  description: string;
  amount: number;
  discount: number;
  due_date: string;
  notes: string | null;
}

export const useUpdateCharge = () =>
  useFinanceMutation<UpdateChargeInput>(async ({ id, ...fields }) => {
    check(await supabase.from('payments').update(fields).eq('id', id));
  });

export const useSetChargeCancelled = () =>
  useFinanceMutation<{ id: string; cancelled: boolean }>(async ({ id, cancelled }) => {
    check(await supabase.from('payments').update({ status: cancelled ? 'cancelado' : 'pendente' }).eq('id', id));
  });

export interface CreateChargeInput {
  clinic_id: string;
  patient_id: string;
  service_id: string | null;
  nutritionist_id: string | null;
  description: string;
  amount: number;
  discount: number;
  due_date: string;
  notes: string | null;
  /** Já recebido no ato do lançamento. */
  paid?: { method: PaymentMethod; paid_at: string } | null;
}

export const useCreateCharge = () =>
  useFinanceMutation<CreateChargeInput>(async ({ paid, ...fields }) => {
    check(await supabase.from('payments').insert({
      ...fields,
      status: paid ? 'pago' : 'pendente',
      method: paid?.method ?? null,
      paid_at: paid?.paid_at ?? null,
    }));
  });

export const useDeletePayment = () =>
  useFinanceMutation<string>(async (id) => {
    check(await supabase.from('payments').delete().eq('id', id));
  });

export interface ExpenseInput {
  clinic_id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  due_date: string;
  paid_at: string | null;
  notes: string | null;
  /** Nº de meses da série (1 = avulsa). Só o primeiro lançamento pode nascer pago. */
  repeatMonths: number;
}

const addMonthsISO = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  // Dia 31 em mês curto cai no último dia do mês (e não "vaza" para o próximo).
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const date = new Date(y, m - 1 + n, Math.min(d, last));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const useCreateExpense = () =>
  useFinanceMutation<ExpenseInput>(async ({ repeatMonths, paid_at, ...fields }) => {
    const seriesId = repeatMonths > 1 ? crypto.randomUUID() : null;
    const rows = Array.from({ length: Math.max(1, repeatMonths) }, (_, i) => ({
      ...fields,
      due_date: addMonthsISO(fields.due_date, i),
      status: i === 0 && paid_at ? 'pago' : 'pendente',
      paid_at: i === 0 ? paid_at : null,
      series_id: seriesId,
    }));
    check(await supabase.from('expenses').insert(rows));
  });

export interface UpdateExpenseInput {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  due_date: string;
  paid_at: string | null;
  notes: string | null;
}

export const useUpdateExpense = () =>
  useFinanceMutation<UpdateExpenseInput>(async ({ id, paid_at, ...fields }) => {
    check(await supabase.from('expenses')
      .update({ ...fields, paid_at, status: paid_at ? 'pago' : 'pendente' })
      .eq('id', id));
  });

export const useToggleExpensePaid = () =>
  useFinanceMutation<{ id: string; paid_at: string | null }>(async ({ id, paid_at }) => {
    check(await supabase.from('expenses').update({ paid_at, status: paid_at ? 'pago' : 'pendente' }).eq('id', id));
  });

/** Exclui um lançamento, ou ele e os seguintes da mesma série. */
export const useDeleteExpense = () =>
  useFinanceMutation<{ expense: ExpenseRecord; scope: 'one' | 'following' }>(async ({ expense, scope }) => {
    if (scope === 'following' && expense.series_id) {
      check(await supabase.from('expenses').delete()
        .eq('series_id', expense.series_id).gte('due_date', expense.due_date));
    } else {
      check(await supabase.from('expenses').delete().eq('id', expense.id));
    }
  });
