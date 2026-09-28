/**
 * Modelo da página de Acompanhamento: datas, recorte de período, status de
 * agendamento, séries de composição corporal e de biomarcadores.
 *
 * Tudo aqui é puro (sem React) para que as seções da página compartilhem a
 * mesma leitura dos dados — antes cada bloco da página derivava datas e
 * status por conta própria e divergia (ex.: consulta por `created_at` num
 * lugar e por `date_time` no outro).
 */
import {
  differenceInCalendarDays,
  differenceInYears,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getCanonicalBiomarkerName } from '../../utils/biomarkers';
import type {
  AppointmentRecord,
  ConsultationRecord,
  ExamRecord,
  MealPlanRecord,
} from '../../types/clinical';
import { pickOne } from '../../types/clinical';

// --- Datas -----------------------------------------------------------------

/** `YYYY-MM-DD` vira meia-noite local (evita o deslocamento de fuso do `new Date`). */
export const parseLocalDate = (value: string | null | undefined): Date => {
  if (!value) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};

export const examDate = (e: ExamRecord): Date => parseLocalDate(e.exam_date || e.created_at);

/** Data clínica da consulta = horário do agendamento (não o momento do registro). */
export const consultationDate = (c: ConsultationRecord): Date =>
  new Date(pickOne(c.appointments)?.date_time || c.created_at);

export const ageFromBirthDate = (birth: string | null | undefined, now = new Date()): number | null => {
  const d = parseLocalDate(birth);
  return isNaN(d.getTime()) ? null : differenceInYears(now, d);
};

export const fmtDate = (d: Date) => format(d, 'dd/MM/yyyy');
export const fmtShortDate = (d: Date) => format(d, 'dd/MM/yy');
export const fmtMonthYear = (d: Date) => {
  const s = format(d, "MMMM 'de' yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const daysAgoLabel = (d: Date, now = new Date()): string => {
  const days = differenceInCalendarDays(now, d);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 0) return days === -1 ? 'amanhã' : `em ${-days} dias`;
  return `há ${days} dias`;
};

// --- Período ---------------------------------------------------------------

export type RecentMonths = 3 | 6 | 12;

export type Period =
  | { kind: 'recent'; months: RecentMonths }
  | { kind: 'all' }
  | { kind: 'month'; year: number; month: number } // month: 0–11
  | { kind: 'year'; year: number };

export const DEFAULT_PERIOD: Period = { kind: 'recent', months: 12 };

/** Lê o parâmetro `?periodo=` (`3m`, `6m`, `12m`, `tudo`, `2026`, `2026-09`). */
export const parsePeriod = (raw: string | null): Period => {
  if (!raw) return DEFAULT_PERIOD;
  if (raw === 'tudo') return { kind: 'all' };
  const recent = raw.match(/^(3|6|12)m$/);
  if (recent) return { kind: 'recent', months: Number(recent[1]) as RecentMonths };
  const month = raw.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const m = Number(month[2]) - 1;
    if (m >= 0 && m <= 11) return { kind: 'month', year: Number(month[1]), month: m };
  }
  const year = raw.match(/^(\d{4})$/);
  if (year) return { kind: 'year', year: Number(year[1]) };
  return DEFAULT_PERIOD;
};

export const serializePeriod = (p: Period): string => {
  switch (p.kind) {
    case 'recent': return `${p.months}m`;
    case 'all': return 'tudo';
    case 'month': return `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
    case 'year': return String(p.year);
  }
};

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export const periodRange = (p: Period, now = new Date()): DateRange => {
  switch (p.kind) {
    case 'recent': return { start: startOfDay(subMonths(now, p.months)), end: endOfDay(now) };
    case 'all': return { start: null, end: endOfDay(now) };
    case 'month': {
      const ref = new Date(p.year, p.month, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }
    case 'year': {
      const ref = new Date(p.year, 0, 1);
      return { start: startOfYear(ref), end: endOfYear(ref) };
    }
  }
};

export const inRange = (d: Date, r: DateRange): boolean =>
  (!r.start || d >= r.start) && (!r.end || d <= r.end);

/** Período como complemento de frase: "nos últimos 6 meses", "em março de 2026". */
export const periodLabel = (p: Period): string => {
  switch (p.kind) {
    case 'recent': return `nos últimos ${p.months} meses`;
    case 'all': return 'em todo o histórico';
    case 'month': return `em ${format(new Date(p.year, p.month, 1), "MMMM 'de' yyyy", { locale: ptBR })}`;
    case 'year': return `em ${p.year}`;
  }
};

// --- Agendamentos ----------------------------------------------------------

export type AppointmentStatus = 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'nao_compareceu';

/**
 * Status exibido do agendamento. "Não compareceu" é derivado: horário já
 * passou e o atendimento não foi concluído nem cancelado.
 */
export const getAppointmentStatus = (apt: AppointmentRecord, now = new Date()): AppointmentStatus => {
  if (apt.status === 'concluido' || apt.status === 'cancelado') return apt.status;
  if (new Date(apt.date_time) < now) return 'nao_compareceu';
  return apt.status === 'confirmado' ? 'confirmado' : 'pendente';
};

export const APPOINTMENT_STATUS_UI: Record<AppointmentStatus, { label: string; badge: string }> = {
  pendente: { label: 'Pendente', badge: 'bg-amber-50 border-amber-100 text-amber-700' },
  confirmado: { label: 'Confirmada', badge: 'bg-teal-50 border-teal-100 text-teal-700' },
  concluido: { label: 'Realizada', badge: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelada', badge: 'bg-slate-100 border-slate-200 text-slate-600' },
  nao_compareceu: { label: 'Não compareceu', badge: 'bg-rose-50 border-rose-100 text-rose-700' },
};

export const isUpcoming = (apt: AppointmentRecord, now = new Date()) => {
  const s = getAppointmentStatus(apt, now);
  return s === 'pendente' || s === 'confirmado';
};

export interface FlowStats {
  done: number;
  missed: number;
  cancelled: number;
  /** concluídas / (concluídas + faltas); null sem base. */
  attendanceRate: number | null;
  /** Intervalo médio em dias entre consultas realizadas no período. */
  avgIntervalDays: number | null;
  lastDone: Date | null;
  daysSinceLastDone: number | null;
  next: AppointmentRecord | null;
}

export const computeFlowStats = (
  appointments: AppointmentRecord[],
  range: DateRange,
  now = new Date(),
): FlowStats => {
  let done = 0;
  let missed = 0;
  let cancelled = 0;
  const doneDatesInRange: number[] = [];
  let lastDone: Date | null = null;
  let next: AppointmentRecord | null = null;

  for (const apt of appointments) {
    const d = new Date(apt.date_time);
    const status = getAppointmentStatus(apt, now);
    if (status === 'concluido' && (!lastDone || d > lastDone)) lastDone = d;
    if ((status === 'pendente' || status === 'confirmado') &&
        (!next || d < new Date(next.date_time))) next = apt;
    if (d > now || !inRange(d, range)) continue;
    if (status === 'concluido') { done++; doneDatesInRange.push(d.getTime()); }
    else if (status === 'nao_compareceu') missed++;
    else if (status === 'cancelado') cancelled++;
  }

  doneDatesInRange.sort((a, b) => a - b);
  const avgIntervalDays = doneDatesInRange.length >= 2
    ? Math.round(
        (doneDatesInRange[doneDatesInRange.length - 1] - doneDatesInRange[0]) /
        (doneDatesInRange.length - 1) / 86_400_000,
      )
    : null;

  return {
    done,
    missed,
    cancelled,
    attendanceRate: done + missed > 0 ? done / (done + missed) : null,
    avgIntervalDays,
    lastDone,
    daysSinceLastDone: lastDone ? differenceInCalendarDays(now, lastDone) : null,
    next,
  };
};

// --- Números ---------------------------------------------------------------

/**
 * Extrai o primeiro número de um texto de laudo. Laudos BR usam vírgula
 * decimal e ponto de milhar ("150.000 /mm³", "5,7 %"), então o ponto seguido
 * de grupos de 3 dígitos é tratado como milhar.
 */
export const parseLabNumber = (raw: string | number | null | undefined): number | null => {
  if (raw == null) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  const token = raw.match(/[-+]?\d[\d.,]*/)?.[0]?.replace(/[.,]$/, '');
  if (!token) return null;
  let normalized = token;
  if (token.includes('.') && token.includes(',')) normalized = token.replace(/\./g, '').replace(',', '.');
  else if (token.includes(',')) normalized = token.replace(',', '.');
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(token)) normalized = token.replace(/\./g, '');
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
};

export interface ReferenceRange {
  low?: number;
  high?: number;
}

/** Interpreta a faixa de referência textual ("70 a 99", "< 200", "superior a 40"). */
export const parseReferenceRange = (ref: string | null | undefined): ReferenceRange | null => {
  if (!ref) return null;
  const s = ref.toLowerCase();
  // Laudos com várias faixas ("Deficiência: < 20; Insuficiência: 20 a 29;
  // Suficiência: 30 a 100", ou homens/mulheres) não têm UMA referência a
  // deduzir — pegar a primeira desenharia a faixa errada. Nesses casos não
  // inferimos nada; a tela mostra o texto original do laudo.
  if ((s.match(/\d[\d.,]*/g) ?? []).length > 2) return null;
  const num = String.raw`(\d[\d.,]*)`;
  const between = s.match(new RegExp(`${num}\\s*(?:a|-|–|até|ate)\\s*${num}`));
  if (between) {
    const low = parseLabNumber(between[1]);
    const high = parseLabNumber(between[2]);
    if (low != null && high != null && low <= high) return { low, high };
  }
  const upper = s.match(new RegExp(`(?:<=|≤|<|inferior a|menor que|abaixo de|até|ate)\\s*${num}`));
  if (upper) {
    const high = parseLabNumber(upper[1]);
    if (high != null) return { high };
  }
  const lower = s.match(new RegExp(`(?:>=|≥|>|superior a|maior que|acima de)\\s*${num}`));
  if (lower) {
    const low = parseLabNumber(lower[1]);
    if (low != null) return { low };
  }
  return null;
};

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const deltaFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });

export const fmtNumber = (n: number) => numberFmt.format(n);
export const fmtDelta = (n: number) => deltaFmt.format(Math.round(n * 10) / 10);

// --- Composição corporal ---------------------------------------------------

export interface BodyPoint {
  consultationId: string;
  date: Date;
  ts: number;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
  /** Altura em metros (a última informada é carregada adiante). */
  height: number | null;
  bmi: number | null;
}

const toMeters = (h: number | null) => (h == null || h <= 0 ? null : h > 3 ? h / 100 : h);

export const buildBodySeries = (consultations: ConsultationRecord[]): BodyPoint[] => {
  const sorted = [...consultations].sort((a, b) => consultationDate(a).getTime() - consultationDate(b).getTime());
  let lastHeight: number | null = null;
  const points: BodyPoint[] = [];
  for (const c of sorted) {
    const ant = c.anthropometry_json ?? {};
    const weight = parseLabNumber(ant.weight ?? null);
    const bodyFat = parseLabNumber(ant.body_fat ?? null);
    const muscleMass = parseLabNumber(ant.muscle_mass ?? null);
    lastHeight = toMeters(parseLabNumber(ant.height ?? null)) ?? lastHeight;
    if (weight == null && bodyFat == null && muscleMass == null) continue;
    const date = consultationDate(c);
    points.push({
      consultationId: c.id,
      date,
      ts: date.getTime(),
      weight,
      bodyFat,
      muscleMass,
      height: lastHeight,
      bmi: weight != null && lastHeight ? Math.round((weight / (lastHeight * lastHeight)) * 10) / 10 : null,
    });
  }
  return points;
};

/** Classificação de IMC da OMS para adultos (≥ 20 anos). */
export const bmiClass = (bmi: number): string => {
  if (bmi < 18.5) return 'Baixo peso';
  if (bmi < 25) return 'Eutrofia';
  if (bmi < 30) return 'Sobrepeso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
};

// --- Biomarcadores ---------------------------------------------------------

export interface BiomarkerPoint {
  examId: string;
  date: Date;
  ts: number;
  value: number | null;
  raw: string;
  reference: string;
  altered: boolean;
  note?: string;
}

export interface BiomarkerSeries {
  name: string;
  /** Pontos em ordem cronológica crescente. */
  points: BiomarkerPoint[];
}

export const buildBiomarkerSeries = (exams: ExamRecord[]): BiomarkerSeries[] => {
  const byName = new Map<string, BiomarkerPoint[]>();
  const sorted = [...exams].sort((a, b) => examDate(a).getTime() - examDate(b).getTime());
  for (const exam of sorted) {
    const date = examDate(exam);
    const seen = new Set<string>();
    for (const b of exam.ai_feedback?.todos_biomarcadores ?? []) {
      const name = getCanonicalBiomarkerName(b.marcador);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const list = byName.get(name) ?? [];
      list.push({
        examId: exam.id,
        date,
        ts: date.getTime(),
        value: parseLabNumber(b.valor),
        raw: b.valor,
        reference: b.referencia,
        altered: b.status?.toLowerCase() === 'alterado',
        note: b.nota_clinica,
      });
      byName.set(name, list);
    }
  }
  return Array.from(byName, ([name, points]) => ({ name, points }));
};

// --- Linha do tempo --------------------------------------------------------

export type JourneyEvent =
  | { kind: 'appointment'; id: string; date: Date; status: AppointmentStatus; appointment: AppointmentRecord }
  | { kind: 'exam'; id: string; date: Date; exam: ExamRecord }
  | { kind: 'mealplan'; id: string; date: Date; plan: MealPlanRecord };

export type JourneyKind = JourneyEvent['kind'];

export const buildJourney = (
  appointments: AppointmentRecord[],
  exams: ExamRecord[],
  mealPlans: MealPlanRecord[],
  now = new Date(),
): JourneyEvent[] => {
  const events: JourneyEvent[] = [
    ...appointments.map((appointment): JourneyEvent => ({
      kind: 'appointment',
      id: `a_${appointment.id}`,
      date: new Date(appointment.date_time),
      status: getAppointmentStatus(appointment, now),
      appointment,
    })),
    ...exams.map((exam): JourneyEvent => ({ kind: 'exam', id: `e_${exam.id}`, date: examDate(exam), exam })),
    ...mealPlans.map((plan): JourneyEvent => ({
      kind: 'mealplan',
      id: `p_${plan.id}`,
      date: new Date(plan.created_at),
      plan,
    })),
  ];
  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
};
