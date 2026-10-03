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

/** Distância até a faixa de referência (0 = dentro). */
const distanceToRange = (v: number, r: ReferenceRange) =>
  r.low != null && v < r.low ? r.low - v : r.high != null && v > r.high ? v - r.high : 0;

export type Trend = 'better' | 'worse' | 'same' | null;

/** Leitura comparativa de um biomarcador: último resultado do período × o anterior. */
export interface BiomarkerRow {
  name: string;
  inPeriod: BiomarkerPoint[];
  last: BiomarkerPoint;
  prev: BiomarkerPoint | null;
  delta: number | null;
  trend: Trend;
  range: ReferenceRange | null;
}

/** Linhas do período, alterados primeiro. `ALL_TIME` dá o retrato atual. */
export const buildBiomarkerRows = (series: BiomarkerSeries[], range: DateRange): BiomarkerRow[] =>
  series
    .map((s): BiomarkerRow | null => {
      const inPeriod = s.points.filter((p) => inRange(p.date, range));
      if (inPeriod.length === 0) return null;
      const last = inPeriod[inPeriod.length - 1];
      // "Anterior" olha o histórico inteiro: comparar com o exame anterior é
      // útil mesmo quando ele caiu fora do período selecionado.
      const idx = s.points.indexOf(last);
      const prev = idx > 0 ? s.points[idx - 1] : null;
      const delta = prev && last.value != null && prev.value != null ? last.value - prev.value : null;
      const refRange = parseReferenceRange(last.reference);
      let trend: Trend = null;
      if (refRange && delta != null && last.value != null && prev?.value != null) {
        const dNow = distanceToRange(last.value, refRange);
        const dPrev = distanceToRange(prev.value, refRange);
        trend = dNow < dPrev ? 'better' : dNow > dPrev ? 'worse' : 'same';
      }
      return { name: s.name, inPeriod, last, prev, delta, trend, range: refRange };
    })
    .filter((r): r is BiomarkerRow => r !== null)
    .sort((a, b) => Number(b.last.altered) - Number(a.last.altered) || a.name.localeCompare(b.name, 'pt-BR'));

export const ALL_TIME: DateRange = { start: null, end: null };

// --- Abas ------------------------------------------------------------------

export type TrackingTab = 'visao' | 'corpo' | 'exames' | 'historico';

export const parseTab = (raw: string | null): TrackingTab =>
  raw === 'corpo' || raw === 'exames' || raw === 'historico' ? raw : 'visao';

export const TAB_PANEL_ID = 'tracking-panel';
export const tabId = (tab: TrackingTab) => `tracking-tab-${tab}`;

// --- Progresso -------------------------------------------------------------

type BodyMetric = 'weight' | 'bodyFat' | 'muscleMass';

export interface MetricChange {
  first: number;
  last: number;
  delta: number;
  firstDate: Date;
  lastDate: Date;
}

const metricChange = (series: BodyPoint[], key: BodyMetric): MetricChange | null => {
  const pts = series.filter((p) => p[key] != null);
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return { first: a[key] as number, last: b[key] as number, delta: (b[key] as number) - (a[key] as number), firstDate: a.date, lastDate: b.date };
};

export interface Progress {
  /** Primeira consulta realizada. */
  start: Date | null;
  doneCount: number;
  weight: MetricChange | null;
  bodyFat: MetricChange | null;
  muscleMass: MetricChange | null;
  /** Pesos em ordem cronológica, para o minigráfico. */
  weightTrail: { ts: number; value: number }[];
}

/** Evolução no histórico inteiro — independe do período selecionado. */
export const buildProgress = (appointments: AppointmentRecord[], body: BodyPoint[], now = new Date()): Progress => {
  const done = appointments
    .filter((a) => getAppointmentStatus(a, now) === 'concluido')
    .map((a) => new Date(a.date_time))
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    start: done[0] ?? null,
    doneCount: done.length,
    weight: metricChange(body, 'weight'),
    bodyFat: metricChange(body, 'bodyFat'),
    muscleMass: metricChange(body, 'muscleMass'),
    weightTrail: body.filter((p) => p.weight != null).map((p) => ({ ts: p.ts, value: p.weight as number })),
  };
};

/**
 * Direção desejada do peso a partir do objetivo (texto livre): -1 perder,
 * +1 ganhar, 0 desconhecida — sem objetivo claro, a cor fica neutra.
 */
export const weightGoalDirection = (goal: string | null | undefined): -1 | 0 | 1 => {
  if (!goal) return 0;
  const s = goal.toLowerCase();
  if (/emagrec|perd|redu|secar|obesid/.test(s)) return -1;
  if (/ganh|hipertrof|engord/.test(s)) return 1;
  return 0;
};

// --- Efeito dos planos -----------------------------------------------------

export interface PlanEffect {
  plan: MealPlanRecord;
  start: Date;
  /** Início do plano seguinte, ou hoje para o plano atual. */
  end: Date;
  current: boolean;
  days: number;
  /** Medições feitas durante a vigência do plano. */
  measurements: number;
  weight: number | null;
  bodyFat: number | null;
  muscleMass: number | null;
}

/**
 * Variação de cada métrica durante a vigência de cada plano: base = última
 * medição até o início do plano (ou a primeira dentro dele); fim = última
 * medição antes do plano seguinte. Do mais recente ao mais antigo.
 */
export const buildPlanEffects = (plans: MealPlanRecord[], body: BodyPoint[], now = new Date()): PlanEffect[] => {
  const sorted = [...plans].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return sorted
    .map((plan, i): PlanEffect => {
      const start = new Date(plan.created_at);
      const next = sorted[i + 1];
      const end = next ? new Date(next.created_at) : now;
      const inWindow = body.filter((p) => p.ts > start.getTime() && p.ts <= end.getTime());
      const change = (key: BodyMetric) => {
        const base = body.filter((p) => p[key] != null && p.ts <= start.getTime()).pop();
        const pts = [...(base ? [base] : []), ...inWindow.filter((p) => p[key] != null)];
        return pts.length < 2 ? null : (pts[pts.length - 1][key] as number) - (pts[0][key] as number);
      };
      return {
        plan,
        start,
        end,
        current: !next,
        days: Math.max(0, differenceInCalendarDays(end, start)),
        measurements: inWindow.length,
        weight: change('weight'),
        bodyFat: change('bodyFat'),
        muscleMass: change('muscleMass'),
      };
    })
    .reverse();
};

// --- Projeção --------------------------------------------------------------

/** Semana do tratamento contada a partir do primeiro plano alimentar. */
export const treatmentWeek = (plans: MealPlanRecord[], now = new Date()): number | null => {
  if (plans.length === 0) return null;
  const first = plans.reduce((a, b) => (new Date(a.created_at) < new Date(b.created_at) ? a : b));
  return Math.floor(Math.max(0, differenceInCalendarDays(now, new Date(first.created_at))) / 7) + 1;
};

export const estimatedWeeks = (exam: ExamRecord | null): number | null =>
  exam?.ai_feedback?.tempo_estimado || exam?.ai_feedback?.base_weeks || null;

// --- Pontos de atenção -----------------------------------------------------

/** Sem retorno agendado e última consulta há mais que isso → alerta. */
export const RETURN_ALERT_DAYS = 60;
const MISSED_WINDOW_MONTHS = 6;
const STALE_EXAM_DAYS = 90;
const STALE_MEASURE_DAYS = 90;
const STALE_PLAN_DAYS = 90;

export type AttentionTarget = { tab: TrackingTab; marker?: string } | { route: string };

export interface AttentionItem {
  id: string;
  tone: 'bad' | 'warn';
  title: string;
  detail?: string;
  action?: { label: string; target: AttentionTarget };
}

const listNames = (names: string[], max = 3) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} e mais ${names.length - max}`;

export const isReturnOverdue = (stats: FlowStats) =>
  !stats.next && stats.daysSinceLastDone != null && stats.daysSinceLastDone > RETURN_ALERT_DAYS;

/**
 * O que pede ação agora, numa lista só — antes cada sinal ficava escondido
 * dentro da sua seção (falta no histórico, alterado no fim da tabela…).
 */
export const buildAttentionItems = (input: {
  stats: FlowStats;
  appointments: AppointmentRecord[];
  /** Retrato atual dos biomarcadores (`buildBiomarkerRows` com `ALL_TIME`). */
  biomarkers: BiomarkerRow[];
  body: BodyPoint[];
  latestPlan: MealPlanRecord | null;
  latestExam: ExamRecord | null;
  mealPlans: MealPlanRecord[];
  now?: Date;
}): AttentionItem[] => {
  const { stats, appointments, biomarkers, body, latestPlan, latestExam, mealPlans, now = new Date() } = input;
  const items: AttentionItem[] = [];

  const altered = biomarkers.filter((r) => r.last.altered);
  if (altered.length > 0) {
    items.push({
      id: 'altered',
      tone: 'bad',
      title: `${altered.length} biomarcador${altered.length > 1 ? 'es alterados' : ' alterado'} no último resultado`,
      detail: listNames(altered.map((r) => r.name)),
      action: { label: 'Ver exames', target: { tab: 'exames', marker: altered[0].name } },
    });
  }

  const worse = biomarkers.filter((r) => r.trend === 'worse');
  if (worse.length > 0) {
    items.push({
      id: 'worse',
      tone: 'bad',
      title: `${worse.length} biomarcador${worse.length > 1 ? 'es se afastaram' : ' se afastou'} da referência`,
      detail: listNames(worse.map((r) => r.name)),
      action: { label: 'Comparar', target: { tab: 'exames', marker: worse[0].name } },
    });
  }

  if (altered.length > 0 && latestExam) {
    const days = differenceInCalendarDays(now, examDate(latestExam));
    if (days > STALE_EXAM_DAYS) {
      items.push({
        id: 'stale-exam',
        tone: 'warn',
        title: `Último exame há ${days} dias, com marcadores alterados`,
        detail: 'Vale pedir um exame de controle.',
        action: { label: 'Anexar exame', target: { route: '/exames' } },
      });
    }
  }

  if (isReturnOverdue(stats)) {
    items.push({
      id: 'return',
      tone: 'warn',
      title: `${stats.daysSinceLastDone} dias sem consulta e nenhum retorno agendado`,
      action: { label: 'Agendar retorno', target: { route: '/agenda' } },
    });
  }

  const missedSince = subMonths(now, MISSED_WINDOW_MONTHS);
  const missed = appointments.filter((a) => {
    const d = new Date(a.date_time);
    return d >= missedSince && getAppointmentStatus(a, now) === 'nao_compareceu';
  }).length;
  if (missed > 0) {
    items.push({
      id: 'missed',
      tone: missed > 1 ? 'bad' : 'warn',
      title: `${missed} falta${missed > 1 ? 's' : ''} nos últimos ${MISSED_WINDOW_MONTHS} meses`,
      action: { label: 'Ver histórico', target: { tab: 'historico' } },
    });
  }

  const lastMeasure = body[body.length - 1] ?? null;
  if (stats.lastDone) {
    if (!lastMeasure) {
      items.push({
        id: 'no-measure',
        tone: 'warn',
        title: 'Nenhuma avaliação física registrada',
        detail: 'Peso, gordura e massa muscular são lançados na consulta.',
      });
    } else {
      const days = differenceInCalendarDays(now, lastMeasure.date);
      if (days > STALE_MEASURE_DAYS && stats.lastDone > lastMeasure.date) {
        items.push({
          id: 'stale-measure',
          tone: 'warn',
          title: `Sem avaliação física há ${days} dias`,
          detail: 'Houve consulta depois, mas sem medições.',
          action: { label: 'Ver composição', target: { tab: 'corpo' } },
        });
      }
    }
  }

  if (latestPlan) {
    const days = differenceInCalendarDays(now, new Date(latestPlan.created_at));
    if (days > STALE_PLAN_DAYS) {
      items.push({
        id: 'stale-plan',
        tone: 'warn',
        title: `Plano alimentar sem revisão há ${days} dias`,
        action: { label: 'Revisar plano', target: { route: '/planos' } },
      });
    }
  } else if (stats.lastDone) {
    items.push({
      id: 'no-plan',
      tone: 'warn',
      title: 'Paciente ainda sem plano alimentar',
      action: { label: 'Criar plano', target: { route: '/planos' } },
    });
  }

  const weeks = estimatedWeeks(latestExam);
  const week = treatmentWeek(mealPlans, now);
  if (weeks && week && week > weeks) {
    items.push({
      id: 'projection',
      tone: 'warn',
      title: `Semana ${week} de ${weeks} estimadas pela IA`,
      detail: 'Passou da duração estimada; vale reavaliar com um novo exame.',
      action: { label: 'Ver projeção', target: { tab: 'exames' } },
    });
  }

  return items.sort((a, b) => Number(b.tone === 'bad') - Number(a.tone === 'bad'));
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
