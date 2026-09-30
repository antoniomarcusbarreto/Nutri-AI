import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Modelo do módulo Financeiro: tipos, rótulos e derivações puras.
 *
 * Datas financeiras (`due_date`, `paid_at`) são `date` no banco — sem fuso.
 * Por isso trabalham sempre como string `yyyy-MM-dd` e são comparadas
 * lexicograficamente; nunca passam por `new Date('yyyy-MM-dd')` (que seria UTC
 * e voltaria um dia no Brasil). Para exibir, `parseISO` lê como data local.
 */

export type PaymentStatus = 'pendente' | 'pago' | 'cancelado';
export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'transferencia' | 'outro';
export type ExpenseCategory = 'aluguel' | 'software' | 'marketing' | 'impostos' | 'material' | 'pessoal' | 'servicos' | 'outros';

export interface PaymentRecord {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string | null;
  service_id: string | null;
  nutritionist_id: string | null;
  description: string;
  amount: number;
  discount: number;
  net_amount: number;
  status: PaymentStatus;
  method: PaymentMethod | null;
  due_date: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  patients: { name: string; cpf: string | null; phone: string | null } | null;
  profiles: { full_name: string | null; crn: string | null } | null;
}

export interface ExpenseRecord {
  id: string;
  clinic_id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  status: 'pendente' | 'pago';
  due_date: string;
  paid_at: string | null;
  series_id: string | null;
  notes: string | null;
}

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  aluguel: 'Aluguel e condomínio',
  software: 'Software e assinaturas',
  marketing: 'Marketing',
  impostos: 'Impostos e taxas',
  material: 'Material e insumos',
  pessoal: 'Pessoal',
  servicos: 'Serviços (contador etc.)',
  outros: 'Outros',
};

// ---------------------------------------------------------------------------
// Datas e mês
// ---------------------------------------------------------------------------

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd');

export interface MonthRef { year: number; month: number } // month 0-11

export const monthRefOf = (d: Date): MonthRef => ({ year: d.getFullYear(), month: d.getMonth() });

/** `?mes=2026-09` → MonthRef (inválido/ausente → mês atual). */
export const parseMonthParam = (v: string | null, fallback: Date): MonthRef => {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]) - 1;
    if (month >= 0 && month <= 11) return { year: Number(m[1]), month };
  }
  return monthRefOf(fallback);
};

export const monthParam = ({ year, month }: MonthRef): string =>
  `${year}-${String(month + 1).padStart(2, '0')}`;

export const shiftMonth = ({ year, month }: MonthRef, delta: number): MonthRef =>
  monthRefOf(new Date(year, month + delta, 1));

/** Primeiro e último dia do mês como `yyyy-MM-dd`. */
export const monthRange = ({ year, month }: MonthRef): { start: string; end: string } => ({
  start: format(new Date(year, month, 1), 'yyyy-MM-dd'),
  end: format(new Date(year, month + 1, 0), 'yyyy-MM-dd'),
});

export const monthLabel = ({ year, month }: MonthRef, pattern = 'MMMM yyyy'): string =>
  format(new Date(year, month, 1), pattern, { locale: ptBR });

export const inMonth = (iso: string | null, ref: MonthRef): boolean => {
  if (!iso) return false;
  const { start, end } = monthRange(ref);
  return iso >= start && iso <= end;
};

export const fmtDay = (iso: string | null, pattern = 'dd/MM/yyyy'): string =>
  iso ? format(parseISO(iso), pattern, { locale: ptBR }) : '—';

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number): string => BRL.format(v || 0);

/** Soma com arredondamento em centavos (evita 0,1 + 0,2 = 0,30000000000000004). */
export const sumCents = (values: number[]): number =>
  Math.round(values.reduce((s, v) => s + Math.round(Number(v) * 100), 0)) / 100;

/** Aceita "150", "150,5", "1.234,56" ou "1234.56". NaN se inválido. */
export const parseMoney = (raw: string): number => {
  const s = raw.trim().replace(/\s|R\$/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

export const moneyInput = (v: number): string =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// ---------------------------------------------------------------------------
// Situação de uma cobrança (vencida é derivada, não um status gravado)
// ---------------------------------------------------------------------------

export type PaymentView = 'pago' | 'a_receber' | 'vencido' | 'cancelado';

export const paymentView = (p: Pick<PaymentRecord, 'status' | 'due_date'>, today: string): PaymentView => {
  if (p.status === 'pago') return 'pago';
  if (p.status === 'cancelado') return 'cancelado';
  return p.due_date < today ? 'vencido' : 'a_receber';
};

export const VIEW_BADGE: Record<PaymentView, { label: string; className: string }> = {
  pago: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  a_receber: { label: 'A receber', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  vencido: { label: 'Vencido', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  cancelado: { label: 'Cancelado', className: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// ---------------------------------------------------------------------------
// Resumo do mês
// ---------------------------------------------------------------------------

export interface MonthSummary {
  /** Caixa: pagamentos com `paid_at` no mês. */
  received: number;
  receivedCount: number;
  /** Cobranças ainda pendentes com vencimento no mês. */
  toReceive: number;
  toReceiveCount: number;
  /** Das pendentes do mês, as já vencidas. */
  overdue: number;
  overdueCount: number;
  /** Despesas com vencimento no mês (pagas + pendentes). */
  expenses: number;
  expensesPaid: number;
  expensesPending: number;
  /** Resultado de caixa: recebido − despesas pagas no mês. */
  result: number;
  /** Recebido ÷ nº de pagamentos recebidos no mês. */
  avgTicket: number;
  byService: { name: string; total: number; count: number }[];
  byMethod: { method: PaymentMethod; total: number; count: number }[];
}

export function summarizeMonth(
  payments: PaymentRecord[],
  expenses: ExpenseRecord[],
  ref: MonthRef,
  today: string,
): MonthSummary {
  const paid = payments.filter((p) => p.status === 'pago' && inMonth(p.paid_at, ref));
  const pending = payments.filter((p) => p.status === 'pendente' && inMonth(p.due_date, ref));
  const overdue = pending.filter((p) => p.due_date < today);
  const monthExpenses = expenses.filter((e) => inMonth(e.due_date, ref));
  const expensesPaidInMonth = expenses.filter((e) => e.status === 'pago' && inMonth(e.paid_at, ref));

  const received = sumCents(paid.map((p) => p.net_amount));
  const expensesPaid = sumCents(expensesPaidInMonth.map((e) => e.amount));

  const group = <K extends string>(rows: PaymentRecord[], key: (p: PaymentRecord) => K) => {
    const map = new Map<K, { total: number; count: number }>();
    for (const p of rows) {
      const k = key(p);
      const cur = map.get(k) ?? { total: 0, count: 0 };
      map.set(k, { total: sumCents([cur.total, p.net_amount]), count: cur.count + 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  };

  return {
    received,
    receivedCount: paid.length,
    toReceive: sumCents(pending.map((p) => p.net_amount)),
    toReceiveCount: pending.length,
    overdue: sumCents(overdue.map((p) => p.net_amount)),
    overdueCount: overdue.length,
    expenses: sumCents(monthExpenses.map((e) => e.amount)),
    expensesPaid,
    expensesPending: sumCents(monthExpenses.filter((e) => e.status === 'pendente').map((e) => e.amount)),
    result: sumCents([received, -expensesPaid]),
    avgTicket: paid.length ? Math.round((received / paid.length) * 100) / 100 : 0,
    byService: group(paid, (p) => p.description).map(([name, v]) => ({ name, ...v })),
    byMethod: group(paid, (p) => (p.method ?? 'outro') as PaymentMethod).map(([method, v]) => ({ method, ...v })),
  };
}

/** Variação percentual vs. mês anterior; null quando não há base de comparação. */
export const deltaPct = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

// ---------------------------------------------------------------------------
// Exportação CSV (padrão Excel pt-BR: `;` e BOM UTF-8)
// ---------------------------------------------------------------------------

const csvCell = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(payments: PaymentRecord[], expenses: ExpenseRecord[], today: string): string {
  const lines: string[] = [];
  lines.push(['Tipo', 'Vencimento', 'Pagamento', 'Descrição', 'Paciente / Categoria', 'Forma', 'Situação', 'Valor bruto', 'Desconto', 'Valor líquido'].join(';'));
  for (const p of payments) {
    lines.push([
      'Receita', fmtDay(p.due_date), p.paid_at ? fmtDay(p.paid_at) : '', p.description,
      p.patients?.name ?? '', p.method ? METHOD_LABEL[p.method] : '',
      VIEW_BADGE[paymentView(p, today)].label, p.amount, p.discount, p.net_amount,
    ].map(csvCell).join(';'));
  }
  for (const e of expenses) {
    lines.push([
      'Despesa', fmtDay(e.due_date), e.paid_at ? fmtDay(e.paid_at) : '', e.description,
      CATEGORY_LABEL[e.category], '', e.status === 'pago' ? 'Pago' : 'A pagar',
      e.amount, 0, -e.amount,
    ].map(csvCell).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

export function downloadText(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Lembrete por WhatsApp
// ---------------------------------------------------------------------------

/** Link wa.me com DDI 55 quando o número vier só com DDD. null se não houver telefone utilizável. */
export function whatsappReminderLink(p: PaymentRecord, clinicName: string): string | null {
  const digits = (p.patients?.phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const phone = digits.length <= 11 ? `55${digits}` : digits;
  const firstName = (p.patients?.name ?? '').split(' ')[0];
  const text =
    `Olá, ${firstName}! Tudo bem? Passando para lembrar do pagamento de ${brl(p.net_amount)} ` +
    `referente a "${p.description}" (${fmtDay(p.due_date)}). ` +
    `Qualquer dúvida é só responder por aqui. — ${clinicName}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Valor por extenso (recibo)
// ---------------------------------------------------------------------------

const UNITS = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

const below1000 = (n: number): string => {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest < 20) {
    if (rest) parts.push(UNITS[rest]);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    parts.push(u ? `${TENS[t]} e ${UNITS[u]}` : TENS[t]);
  }
  return parts.join(' e ');
};

const integerInWords = (n: number): string => {
  if (n === 0) return 'zero';
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? 'um milhão' : `${below1000(millions)} milhões`);
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${below1000(thousands)} mil`);
  if (rest) parts.push(below1000(rest));
  // "mil e cem", "mil e vinte" — o "e" final só entra quando o resto é < 100 ou centena exata.
  if (parts.length > 1 && rest && (rest < 100 || rest % 100 === 0)) {
    const last = parts.pop()!;
    return `${parts.join(' ')} e ${last}`;
  }
  return parts.join(' ');
};

export function amountInWords(value: number): string {
  const cents = Math.round(value * 100);
  const reais = Math.floor(cents / 100);
  const c = cents % 100;
  const reaisPart = reais ? `${integerInWords(reais)} ${reais === 1 ? 'real' : 'reais'}` : '';
  const needsDe = reais >= 1_000_000 && reais % 1_000_000 === 0;
  const reaisText = needsDe ? reaisPart.replace(/(reais)$/, 'de reais') : reaisPart;
  const centsPart = c ? `${integerInWords(c)} ${c === 1 ? 'centavo' : 'centavos'}` : '';
  if (reaisText && centsPart) return `${reaisText} e ${centsPart}`;
  return reaisText || centsPart || 'zero real';
}
