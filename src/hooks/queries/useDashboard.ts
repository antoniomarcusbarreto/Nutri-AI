import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk, monthKeyOf } from '../../lib/queryKeys';
import { pickOne } from '../../types/clinical';

/** Limites [início, fim] do mês de `d`, em ISO (colunas timestamptz). */
function monthBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end, startISO: start.toISOString(), endISO: end.toISOString() };
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Início do mês de `d` como `YYYY-MM-DD` (colunas `date`). Não usar
 * `monthBounds` aqui: em UTC os limites caem em outro dia (23:59 de Brasília =
 * 02:59Z do dia seguinte), e o Postgres converte o literal para essa data.
 */
function monthDateBounds(d: Date) {
  return { startDate: ymd(new Date(d.getFullYear(), d.getMonth(), 1)) };
}

const DAY = 24 * 60 * 60 * 1000;
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Status que não contam como atendimento (nem previsto, nem realizado). */
const NOT_HELD = '(cancelado,nao_compareceu)';

type One<T> = T | T[] | null;

// ---------------------------------------------------------------------------
// Resultados do mês
// ---------------------------------------------------------------------------

export interface MonthActivity {
  /** Consultas do mês, sem canceladas e faltas. */
  appointments: number;
  /** `null` quando o papel não tem acesso a dados clínicos (secretária). */
  mealPlans: number | null;
  /** Horas de atendimentos concluídos no mês (duração dos serviços). */
  attendedHours: number;
  /** Consultas já passadas no mês (sem canceladas): base do comparecimento. */
  pastHeld: number;
  /** Das passadas, as concluídas. */
  concluded: number;
}

export interface ClinicStats {
  patientsCount: number;
  current: MonthActivity;
  previous: MonthActivity;
}

async function fetchMonthActivity(clinicId: string, month: Date, includeClinical: boolean): Promise<MonthActivity> {
  const { start, startISO, endISO, end } = monthBounds(month);
  const now = new Date();
  // Comparecimento só olha o que já aconteceu: mês futuro não tem base.
  const pastUntil = end < now ? end : now;
  const hasPast = pastUntil > start;

  const [appointments, mealPlans, past] = await Promise.all([
    supabase.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinicId).not('status', 'in', NOT_HELD)
      .gte('date_time', startISO).lte('date_time', endISO),
    includeClinical
      ? supabase.from('meal_plans')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId).gte('created_at', startISO).lte('created_at', endISO)
      : Promise.resolve(null),
    hasPast
      ? supabase.from('appointments')
        .select('status, services ( duration_minutes )')
        .eq('clinic_id', clinicId).neq('status', 'cancelado')
        .gte('date_time', startISO).lte('date_time', pastUntil.toISOString())
      : Promise.resolve(null),
  ]);
  if (appointments.error) throw appointments.error;
  if (mealPlans?.error) throw mealPlans.error;
  if (past?.error) throw past.error;

  type PastRow = { status: string; services: One<{ duration_minutes?: number }> };
  const pastRows = (past?.data ?? []) as PastRow[];
  const concludedRows = pastRows.filter((r) => r.status === 'concluido');
  const totalMinutes = concludedRows.reduce(
    (sum, row) => sum + (pickOne(row.services)?.duration_minutes ?? 60), // default 60 min quando sem serviço
    0,
  );

  return {
    appointments: appointments.count ?? 0,
    mealPlans: mealPlans ? mealPlans.count ?? 0 : null,
    attendedHours: Math.round(totalMinutes / 60),
    pastHeld: pastRows.length,
    concluded: concludedRows.length,
  };
}

/**
 * Contadores do Dashboard, com o mês anterior para comparação.
 * Refaz só quando muda o mês. `includeClinical = false` para a secretária, que
 * não lê planos alimentares (RLS da 0029 devolveria sempre 0).
 */
export function useClinicStats(clinicId: string | undefined, month: Date, includeClinical: boolean) {
  const monthKey = monthKeyOf(month);
  return useQuery({
    queryKey: [...qk.clinic.stats(clinicId ?? 'none', monthKey), includeClinical],
    enabled: !!clinicId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ClinicStats> => {
      const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
      // Tudo em paralelo (sem waterfall).
      const [patients, current, previous] = await Promise.all([
        supabase.from('patients')
          .select('*', { count: 'exact', head: true })
          .eq('clinic_id', clinicId!).eq('status', 'ativo'),
        fetchMonthActivity(clinicId!, month, includeClinical),
        fetchMonthActivity(clinicId!, prevMonth, includeClinical),
      ]);
      if (patients.error) throw patients.error;
      return { patientsCount: patients.count ?? 0, current, previous };
    },
  });
}

// ---------------------------------------------------------------------------
// Agenda de hoje + próximos dias
// ---------------------------------------------------------------------------

export interface AgendaAppointment {
  id: string;
  public_token: string | null;
  patient_id: string | null;
  nutritionist_id: string | null;
  date_time: string;
  status: string;
  patients: One<{ name?: string | null }>;
  services: One<{ name?: string | null; duration_minutes?: number | null }>;
  profiles: One<{ full_name?: string | null }>;
}

export interface AgendaWindow {
  today: AgendaAppointment[];
  /** Próximas consultas depois de hoje (até 5). */
  later: AgendaAppointment[];
}

/**
 * Consultas de hoje (inclusive as que já passaram, para mostrar o que ficou
 * sem registro) e as 5 seguintes. Sem canceladas.
 */
export function useAgendaWindow(clinicId: string | undefined) {
  const today = startOfToday();
  return useQuery({
    queryKey: qk.appointments.agenda(clinicId ?? 'none', ymd(today)),
    enabled: !!clinicId,
    staleTime: 0,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<AgendaWindow> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, public_token, patient_id, nutritionist_id, date_time, status,
          patients:patient_id(name),
          services:service_id(name, duration_minutes),
          profiles:nutritionist_id(full_name)
        `)
        .eq('clinic_id', clinicId!)
        .neq('status', 'cancelado')
        .gte('date_time', today.toISOString())
        .order('date_time', { ascending: true })
        .limit(40);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AgendaAppointment[];
      const tomorrow = new Date(today.getTime() + DAY);
      return {
        today: rows.filter((a) => new Date(a.date_time) < tomorrow),
        later: rows.filter((a) => new Date(a.date_time) >= tomorrow && a.status !== 'nao_compareceu').slice(0, 5),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Pendências
// ---------------------------------------------------------------------------

export interface PendingConfirmation { id: string; patientName: string; dateTime: string; token: string | null }
export interface MissingForm { patientId: string; patientName: string; dateTime: string; formToken: string | null }
export interface PendingExam { id: string; patientId: string; patientName: string; uploadedAt: string }
export interface PatientSince { patientId: string; patientName: string; since: string }

export interface DashboardActions {
  /** Consultas pendentes de confirmação nas próximas 48h. */
  confirmations: PendingConfirmation[];
  /** Consultas nos próximos 7 dias de pacientes sem ficha de saúde preenchida. */
  missingForms: MissingForm[];
  /** Exames enviados sem análise da IA. */
  pendingExams: PendingExam[];
  /** Pacientes atendidos nos últimos 30 dias sem plano alimentar depois da consulta. */
  withoutPlan: PatientSince[];
  /** Pacientes ativos sem consulta há 45+ dias e sem retorno marcado. */
  withoutReturn: PatientSince[];
}

const HEALTH_FIELDS = ['allergies', 'dietary_restrictions', 'pathologies', 'medications', 'physical_activity_level', 'profession', 'sleep_quality'] as const;
type HealthRow = Partial<Record<(typeof HEALTH_FIELDS)[number], string | null>>;

/** Ficha "preenchida" = existe e tem ao menos um campo com conteúdo (a 0029 criou linhas vazias no backfill). */
const hasHealthData = (h: One<HealthRow>) => {
  const row = pickOne(h);
  return !!row && HEALTH_FIELDS.some((f) => (row[f] ?? '').trim() !== '');
};

const RETURN_AFTER_DAYS = 45;

/**
 * Fila de pendências do Dashboard. Itens clínicos só para owner/nutritionist e
 * só dos próprios atendimentos — a secretária recebe apenas as confirmações
 * (da clínica toda, que é o trabalho dela).
 */
export function useDashboardActions(clinicId: string | undefined, userId: string | undefined, clinical: boolean) {
  return useQuery({
    queryKey: qk.dashboard.actions(clinicId ?? 'none', userId ?? 'none', clinical),
    enabled: !!clinicId && !!userId,
    staleTime: 0,
    queryFn: async (): Promise<DashboardActions> => {
      const now = new Date();
      const nowISO = now.toISOString();
      const in48h = new Date(now.getTime() + 2 * DAY).toISOString();
      const in7d = new Date(now.getTime() + 7 * DAY).toISOString();
      const ago30d = new Date(now.getTime() - 30 * DAY).toISOString();
      const ago365d = new Date(now.getTime() - 365 * DAY).toISOString();

      let confirmationsQuery = supabase.from('appointments')
        .select('id, date_time, public_token, patients:patient_id(name)')
        .eq('clinic_id', clinicId!).eq('status', 'pendente')
        .gte('date_time', nowISO).lte('date_time', in48h)
        .order('date_time', { ascending: true });
      if (clinical) confirmationsQuery = confirmationsQuery.eq('nutritionist_id', userId!);

      if (!clinical) {
        const { data, error } = await confirmationsQuery;
        if (error) throw error;
        return { confirmations: mapConfirmations(data), missingForms: [], pendingExams: [], withoutPlan: [], withoutReturn: [] };
      }

      const [confirmations, upcoming, exams, consultations, plans, history] = await Promise.all([
        confirmationsQuery,
        supabase.from('appointments')
          .select(`patient_id, date_time, patients:patient_id(name, form_token, patient_health(${HEALTH_FIELDS.join(', ')}))`)
          .eq('clinic_id', clinicId!).eq('nutritionist_id', userId!).not('status', 'in', NOT_HELD)
          .gte('date_time', nowISO).lte('date_time', in7d)
          .order('date_time', { ascending: true }),
        supabase.from('patient_exams')
          .select('id, created_at, patient_id, patients(name)')
          .is('ai_feedback', null)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('consultations')
          .select('patient_id, created_at, patients(name), appointments!inner(nutritionist_id)')
          .eq('clinic_id', clinicId!).eq('appointments.nutritionist_id', userId!)
          .gte('created_at', ago30d),
        supabase.from('meal_plans')
          .select('patient_id, created_at')
          .eq('clinic_id', clinicId!).gte('created_at', ago30d),
        supabase.from('appointments')
          .select('patient_id, date_time, status, patients:patient_id(name, status)')
          .eq('clinic_id', clinicId!).eq('nutritionist_id', userId!).neq('status', 'cancelado')
          .gte('date_time', ago365d)
          .order('date_time', { ascending: false })
          .limit(1000),
      ]);
      for (const r of [confirmations, upcoming, exams, consultations, plans, history]) {
        if (r.error) throw r.error;
      }

      // Ficha de saúde: um item por paciente, na consulta mais próxima.
      type UpcomingRow = { patient_id: string; date_time: string; patients: One<{ name?: string; form_token?: string | null; patient_health?: One<HealthRow> }> };
      const missingForms = new Map<string, MissingForm>();
      for (const row of (upcoming.data ?? []) as unknown as UpcomingRow[]) {
        const p = pickOne(row.patients);
        if (!p || missingForms.has(row.patient_id) || hasHealthData(p.patient_health ?? null)) continue;
        missingForms.set(row.patient_id, { patientId: row.patient_id, patientName: p.name ?? 'Paciente', dateTime: row.date_time, formToken: p.form_token ?? null });
      }

      type ExamRow = { id: string; created_at: string; patient_id: string; patients: One<{ name?: string }> };
      const pendingExams = ((exams.data ?? []) as unknown as ExamRow[]).map((e) => ({
        id: e.id, patientId: e.patient_id, patientName: pickOne(e.patients)?.name ?? 'Paciente', uploadedAt: e.created_at,
      }));

      // Sem plano: última consulta do paciente sem nenhum plano criado no mesmo dia ou depois.
      type ConsultRow = { patient_id: string; created_at: string; patients: One<{ name?: string }> };
      const lastConsult = new Map<string, ConsultRow>();
      for (const c of (consultations.data ?? []) as unknown as ConsultRow[]) {
        const cur = lastConsult.get(c.patient_id);
        if (!cur || c.created_at > cur.created_at) lastConsult.set(c.patient_id, c);
      }
      const lastPlan = new Map<string, string>();
      for (const p of (plans.data ?? []) as { patient_id: string; created_at: string }[]) {
        const cur = lastPlan.get(p.patient_id);
        if (!cur || p.created_at > cur) lastPlan.set(p.patient_id, p.created_at);
      }
      const withoutPlan = [...lastConsult.values()]
        .filter((c) => {
          const plan = lastPlan.get(c.patient_id);
          return !plan || ymd(new Date(plan)) < ymd(new Date(c.created_at));
        })
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ patientId: c.patient_id, patientName: pickOne(c.patients)?.name ?? 'Paciente', since: c.created_at }));

      // Sem retorno: última consulta concluída antiga e nada marcado no futuro.
      type HistoryRow = { patient_id: string; date_time: string; status: string; patients: One<{ name?: string; status?: string }> };
      const byPatient = new Map<string, { name: string; active: boolean; lastVisit: string | null; hasFuture: boolean }>();
      for (const a of (history.data ?? []) as unknown as HistoryRow[]) {
        const p = pickOne(a.patients);
        const entry = byPatient.get(a.patient_id) ?? { name: p?.name ?? 'Paciente', active: p?.status === 'ativo', lastVisit: null, hasFuture: false };
        if (a.date_time >= nowISO && a.status !== 'nao_compareceu') entry.hasFuture = true;
        if (a.status === 'concluido' && (!entry.lastVisit || a.date_time > entry.lastVisit)) entry.lastVisit = a.date_time;
        byPatient.set(a.patient_id, entry);
      }
      const returnCutoff = new Date(now.getTime() - RETURN_AFTER_DAYS * DAY).toISOString();
      const withoutReturn = [...byPatient.entries()]
        .filter(([, e]) => e.active && !e.hasFuture && e.lastVisit && e.lastVisit < returnCutoff)
        .sort(([, a], [, b]) => a.lastVisit!.localeCompare(b.lastVisit!))
        .map(([patientId, e]) => ({ patientId, patientName: e.name, since: e.lastVisit! }));

      return {
        confirmations: mapConfirmations(confirmations.data),
        missingForms: [...missingForms.values()],
        pendingExams,
        withoutPlan,
        withoutReturn,
      };
    },
  });
}

function mapConfirmations(data: unknown): PendingConfirmation[] {
  type Row = { id: string; date_time: string; public_token: string | null; patients: One<{ name?: string }> };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, dateTime: r.date_time, token: r.public_token, patientName: pickOne(r.patients)?.name ?? 'Paciente',
  }));
}

// ---------------------------------------------------------------------------
// Primeiros passos (conta nova)
// ---------------------------------------------------------------------------

export interface SetupProgress {
  services: boolean;
  patients: boolean;
  appointments: boolean;
  mealPlans: boolean;
}

/** O que a clínica já tem cadastrado — alimenta a lista de primeiros passos do dono. */
export function useSetupProgress(clinicId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.dashboard.setup(clinicId ?? 'none'),
    enabled: !!clinicId && enabled,
    staleTime: 0,
    queryFn: async (): Promise<SetupProgress> => {
      const count = (table: 'services' | 'patients' | 'appointments' | 'meal_plans') =>
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId!);
      const [services, patients, appointments, mealPlans] = await Promise.all([
        count('services'), count('patients'), count('appointments'), count('meal_plans'),
      ]);
      for (const r of [services, patients, appointments, mealPlans]) {
        if (r.error) throw r.error;
      }
      return {
        services: (services.count ?? 0) > 0,
        patients: (patients.count ?? 0) > 0,
        appointments: (appointments.count ?? 0) > 0,
        mealPlans: (mealPlans.count ?? 0) > 0,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Lembretes
// ---------------------------------------------------------------------------

/**
 * Lembretes: todos os pendentes (qualquer data — um lembrete esquecido não pode
 * sumir na virada do mês) + os concluídos do mês corrente.
 */
export function useReminders(clinicId: string | undefined) {
  const now = new Date();
  return useQuery({
    queryKey: qk.reminders.byMonth(clinicId ?? 'none', monthKeyOf(now)),
    enabled: !!clinicId,
    queryFn: async () => {
      const { startDate } = monthDateBounds(now);
      const { data, error } = await supabase
        .from('reminders')
        .select('*, profiles:user_id(full_name)')
        .eq('clinic_id', clinicId!)
        .or(`is_completed.is.false,due_date.gte.${startDate}`)
        .order('is_completed', { ascending: true })
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
