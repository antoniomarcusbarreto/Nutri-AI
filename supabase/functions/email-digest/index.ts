// supabase/functions/email-digest/index.ts
// Resumo por e-mail da equipe (migration 0041): diário e, na segunda-feira,
// semanal no lugar do diário.
//
// Dois modos:
//   { mode: "cron" }      → pg_cron a cada 15 min, cabeçalho x-cron-secret.
//                           Envia para quem está na janela do horário escolhido
//                           (até 3h depois, para cobrir falhas do cron) e ainda
//                           não recebeu hoje. O envio é "reservado" gravando a
//                           data antes de mandar (dois cron simultâneos não
//                           duplicam); se o Resend falhar, a reserva é desfeita.
//   { mode: "preview", kind: "daily" | "weekly" }
//                         → botão "Enviar um exemplo agora" (JWT do usuário).
//                           Manda para o próprio e-mail de quem pediu, com os
//                           dados reais, no máximo 1 por minuto.
//
// Isolamento: a função usa a service role, então os filtros abaixo reproduzem
// o RLS por papel. Dono/nutricionista: a própria agenda e os próprios pacientes
// (o dono vê o financeiro da clínica, como no app). Secretária: agenda e
// cobranças da clínica, sem nada clínico e sem valores recebidos.
//
// Publicar com --no-verify-jwt (o cron não manda JWT; o modo preview valida o
// token aqui dentro).
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, DIGEST_CRON_SECRET.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  APP_URL, renderDailyDigest, renderWeeklyDigest,
  type DigestAgendaGroup, type DigestAppointment, type DigestCharge, type DigestList,
  type DigestPatientNote, type DigestPortalRequest, type DailyDigest, type WeeklyDigest,
} from "../_shared/digest-email.ts";

const BASE_ORIGINS = [
  "https://nutri-ai.io",
  "https://www.nutri-ai.io",
  "https://nutri-ai-self-nine.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];
const EXTRA_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...BASE_ORIGINS, ...EXTRA_ORIGINS];

const REMETENTE = "Nutri-AI <suporte@notificacoes.codehatch.com.br>";
const RESPONDER_PARA = "suporte@codehatch.com.br";
const PREFERENCES_URL = `${APP_URL}/settings`;

/** Quanto tempo depois do horário escolhido o envio ainda vale. */
const SEND_WINDOW_MIN = 180;
const LIST_LIMIT = 8;
const RETURN_AFTER_DAYS = 45;
const DIARY_IDLE_DAYS = 4;
const DAY = 24 * 60 * 60 * 1000;

function cors(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(body: unknown, status: number, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// Datas no fuso do destinatário
// ---------------------------------------------------------------------------
type Ymd = string; // "2026-10-12"

function localNow(tz: string, now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}` as Ymd,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Deslocamento do fuso em minutos (ex.: São Paulo = -180). */
function tzOffsetMin(tz: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

const addDays = (ymd: Ymd, n: number): Ymd => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** Meia-noite local de `ymd`, em UTC. */
function localMidnight(tz: string, ymd: Ymd): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return new Date(guess - tzOffsetMin(tz, new Date(guess)) * 60_000);
}
const ymdNoon = (ymd: Ymd) => new Date(`${ymd}T12:00:00Z`);

const fmt = (tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts });
const fmtTime = (tz: string, iso: string) => fmt(tz, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDayMonth = (tz: string, iso: string) => fmt(tz, { day: "2-digit", month: "2-digit" }).format(new Date(iso));
const fmtWhen = (tz: string, iso: string) =>
  fmt(tz, { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateLabelOf = (ymd: Ymd) => fmt("UTC", { weekday: "long", day: "numeric", month: "long" }).format(ymdNoon(ymd));
function weekLabelOf(monday: Ymd, sunday: Ymd) {
  const a = ymdNoon(monday), b = ymdNoon(sunday);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${a.getUTCDate()} a ${b.getUTCDate()} de ${fmt("UTC", { month: "long" }).format(b)}`
    : `${fmt("UTC", { day: "numeric", month: "long" }).format(a)} a ${fmt("UTC", { day: "numeric", month: "long" }).format(b)}`;
}
const daysBetween = (fromIso: string, to: Date) => Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / DAY));
const ymdToBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

// ---------------------------------------------------------------------------
// Montagem dos dados
// ---------------------------------------------------------------------------
type One<T> = T | T[] | null;
const one = <T>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const list = <T>(all: T[], limit = LIST_LIMIT): DigestList<T> => ({ items: all.slice(0, limit), total: all.length });

type Ctx = {
  admin: SupabaseClient;
  userId: string;
  clinicId: string;
  role: "owner" | "nutritionist" | "secretary";
  tz: string;
  today: Ymd;
  now: Date;
};
const isNutri = (c: Ctx) => c.role !== "secretary";

function check<T extends { error: unknown }>(r: T): T {
  if (r.error) throw r.error;
  return r;
}

type ApptRow = {
  id: string; date_time: string; status: string; nutritionist_id: string;
  patients: One<{ name?: string }>; services: One<{ name?: string }>; profiles: One<{ full_name?: string }>;
};

async function fetchAgenda(c: Ctx, fromYmd: Ymd, toYmdExclusive: Ymd): Promise<ApptRow[]> {
  let q = c.admin.from("appointments")
    .select("id, date_time, status, nutritionist_id, patients:patient_id(name), services:service_id(name), profiles:nutritionist_id(full_name)")
    .eq("clinic_id", c.clinicId)
    .not("status", "in", "(cancelado,nao_compareceu)")
    .gte("date_time", localMidnight(c.tz, fromYmd).toISOString())
    .lt("date_time", localMidnight(c.tz, toYmdExclusive).toISOString())
    .order("date_time", { ascending: true })
    .limit(500);
  if (isNutri(c)) q = q.eq("nutritionist_id", c.userId);
  return (check(await q).data ?? []) as unknown as ApptRow[];
}

function groupAgenda(c: Ctx, rows: ApptRow[]): DigestAgendaGroup[] {
  const toAppt = (r: ApptRow): DigestAppointment => ({
    time: fmtTime(c.tz, r.date_time),
    patient: one(r.patients)?.name ?? "Paciente",
    kind: one(r.services)?.name ?? "Consulta",
    confirmed: r.status !== "pendente",
  });
  if (isNutri(c)) return [{ appointments: rows.map(toAppt) }];
  const byNutri = new Map<string, DigestAgendaGroup>();
  for (const r of rows) {
    const name = one(r.profiles)?.full_name ?? "Nutricionista";
    const g = byNutri.get(name) ?? { nutritionist: name, appointments: [] };
    g.appointments.push(toAppt(r));
    byNutri.set(name, g);
  }
  return [...byNutri.values()].sort((a, b) => a.nutritionist!.localeCompare(b.nutritionist!, "pt-BR"));
}

async function fetchPortalRequests(c: Ctx): Promise<DigestList<DigestPortalRequest>> {
  const { data } = check(await c.admin.from("appointment_change_requests")
    .select("kind, requested_at, nutritionist_id, patients(name), appointments(date_time, nutritionist_id)")
    .eq("clinic_id", c.clinicId).eq("status", "pendente")
    .order("created_at", { ascending: true }).limit(200));
  type Row = { kind: string; requested_at: string | null; nutritionist_id: string | null; patients: One<{ name?: string }>; appointments: One<{ date_time?: string; nutritionist_id?: string }> };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) =>
    !isNutri(c) || r.nutritionist_id === c.userId || one(r.appointments)?.nutritionist_id === c.userId);
  return list(rows.map((r) => {
    const appt = one(r.appointments)?.date_time;
    const requested = r.requested_at ? fmtWhen(c.tz, r.requested_at) : null;
    if (r.kind === "booking") {
      return { patient: one(r.patients)?.name ?? "Paciente", what: "Pediu consulta", when: requested ? `Horário pedido: ${requested}` : "Sem horário definido" };
    }
    if (r.kind === "cancel") {
      return { patient: one(r.patients)?.name ?? "Paciente", what: "Pediu cancelamento", when: appt ? `Consulta de ${fmtWhen(c.tz, appt)}` : "" };
    }
    return {
      patient: one(r.patients)?.name ?? "Paciente",
      what: "Pediu remarcação",
      when: [appt ? `Consulta de ${fmtWhen(c.tz, appt)}` : null, requested ? `quer ${requested}` : null].filter(Boolean).join(" · "),
    };
  }));
}

type PaymentRow = {
  net_amount: number | string; due_date: string; paid_at: string | null; description: string;
  patients: One<{ name?: string }>; profiles: One<{ full_name?: string }>;
};

function paymentsQuery(c: Ctx) {
  let q = c.admin.from("payments")
    .select("net_amount, due_date, paid_at, description, patients(name), profiles!payments_nutritionist_id_fkey(full_name)")
    .eq("clinic_id", c.clinicId);
  // Nutricionista: só as próprias cobranças. Dono e secretária: a clínica.
  if (c.role === "nutritionist") q = q.eq("nutritionist_id", c.userId);
  return q;
}

async function fetchFinance(c: Ctx, dueFrom: Ymd, dueTo: Ymd) {
  const [due, overdue] = await Promise.all([
    paymentsQuery(c).eq("status", "pendente").gte("due_date", dueFrom).lte("due_date", dueTo).order("due_date").limit(500),
    paymentsQuery(c).eq("status", "pendente").lt("due_date", c.today).order("due_date").limit(1000),
  ]);
  const withNutri = (r: PaymentRow, detail: string) =>
    c.role === "secretary" && one(r.profiles)?.full_name ? `${one(r.profiles)!.full_name} · ${detail}` : detail;
  const toCharge = (r: PaymentRow, detail: string): DigestCharge => ({
    patient: one(r.patients)?.name ?? "Paciente", amount: Number(r.net_amount), detail: withNutri(r, detail),
  });
  const dueRows = (check(due).data ?? []) as unknown as PaymentRow[];
  const overdueRows = (check(overdue).data ?? []) as unknown as PaymentRow[];
  const todayNoon = ymdNoon(c.today);
  return {
    dueToday: list(dueRows.map((r) => toCharge(r, dueFrom === dueTo ? r.description : `${ymdToBr(r.due_date)} · ${r.description}`))),
    overdue: list(overdueRows.map((r) => {
      const days = Math.round((todayNoon.getTime() - ymdNoon(r.due_date).getTime()) / DAY);
      return toCharge(r, `Venceu em ${ymdToBr(r.due_date)} · ${days} ${days === 1 ? "dia" : "dias"}`);
    })),
    overdueTotal: overdueRows.reduce((s, r) => s + Number(r.net_amount), 0),
  };
}

async function receivedBetween(c: Ctx, from: Ymd, to: Ymd): Promise<number> {
  const { data } = check(await paymentsQuery(c).eq("status", "pago").gte("paid_at", from).lte("paid_at", to).limit(5000));
  return ((data ?? []) as unknown as PaymentRow[]).reduce((s, r) => s + Number(r.net_amount), 0);
}

async function fetchClinical(c: Ctx) {
  const ago30 = new Date(c.now.getTime() - 30 * DAY).toISOString();
  const [exams, consultations, plans, portalPatients] = await Promise.all([
    c.admin.from("patient_exams")
      .select("created_at, patients!inner(name, nutritionist_id, clinic_id)")
      .is("ai_feedback", null)
      .eq("patients.nutritionist_id", c.userId).eq("patients.clinic_id", c.clinicId)
      .gte("created_at", ago30)
      .order("created_at", { ascending: false }).limit(50),
    c.admin.from("consultations")
      .select("patient_id, created_at, patients(name), appointments!inner(nutritionist_id)")
      .eq("clinic_id", c.clinicId).eq("appointments.nutritionist_id", c.userId)
      .gte("created_at", ago30),
    c.admin.from("meal_plans").select("patient_id, created_at").eq("clinic_id", c.clinicId).gte("created_at", ago30),
    c.admin.from("patients").select("id, name")
      .eq("clinic_id", c.clinicId).eq("nutritionist_id", c.userId).eq("status", "ativo")
      .gt("portal_access_until", c.now.toISOString()),
  ]);
  for (const r of [exams, consultations, plans, portalPatients]) check(r);

  type ExamRow = { created_at: string; patients: One<{ name?: string }> };
  const newExams: DigestPatientNote[] = ((exams.data ?? []) as unknown as ExamRow[]).map((e) => ({
    patient: one(e.patients)?.name ?? "Paciente",
    note: `Enviado em ${fmtDayMonth(c.tz, e.created_at)}, ainda sem análise`,
  }));

  // Sem plano: última consulta (30 dias) sem plano criado no mesmo dia ou depois.
  type ConsultRow = { patient_id: string; created_at: string; patients: One<{ name?: string }> };
  const lastConsult = new Map<string, ConsultRow>();
  for (const r of (consultations.data ?? []) as unknown as ConsultRow[]) {
    const cur = lastConsult.get(r.patient_id);
    if (!cur || r.created_at > cur.created_at) lastConsult.set(r.patient_id, r);
  }
  const lastPlan = new Map<string, string>();
  for (const p of (plans.data ?? []) as { patient_id: string; created_at: string }[]) {
    const cur = lastPlan.get(p.patient_id);
    if (!cur || p.created_at > cur) lastPlan.set(p.patient_id, p.created_at);
  }
  const localYmd = (iso: string) => localNow(c.tz, new Date(iso)).ymd;
  const withoutPlan: DigestPatientNote[] = [...lastConsult.values()]
    .filter((r) => {
      const plan = lastPlan.get(r.patient_id);
      return !plan || localYmd(plan) < localYmd(r.created_at);
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => ({ patient: one(r.patients)?.name ?? "Paciente", note: `Atendido(a) em ${fmtDayMonth(c.tz, r.created_at)}, ainda sem plano alimentar` }));

  // Diário parado: usou o diário nos últimos 30 dias, mas não nos últimos N.
  const patients = (portalPatients.data ?? []) as { id: string; name: string }[];
  let diaryInactive: DigestPatientNote[] = [];
  if (patients.length) {
    const { data: logs } = check(await c.admin.from("meal_logs").select("patient_id, eaten_at")
      .eq("clinic_id", c.clinicId).in("patient_id", patients.map((p) => p.id)).gte("eaten_at", ago30).limit(5000));
    const last = new Map<string, string>();
    for (const l of (logs ?? []) as { patient_id: string; eaten_at: string }[]) {
      const cur = last.get(l.patient_id);
      if (!cur || l.eaten_at > cur) last.set(l.patient_id, l.eaten_at);
    }
    diaryInactive = patients
      .filter((p) => last.has(p.id) && daysBetween(last.get(p.id)!, c.now) >= DIARY_IDLE_DAYS)
      .sort((a, b) => last.get(a.id)!.localeCompare(last.get(b.id)!))
      .map((p) => ({ patient: p.name, note: `Sem registrar refeições há ${daysBetween(last.get(p.id)!, c.now)} dias` }));
  }

  return { newExams: list(newExams, 5), withoutPlan: list(withoutPlan, 5), diaryInactive: list(diaryInactive, 5) };
}

/** Pacientes ativos sem consulta há 45+ dias e sem nada marcado (mesma regra do Dashboard). */
async function fetchReturnsDue(c: Ctx): Promise<DigestList<DigestPatientNote>> {
  let q = c.admin.from("appointments")
    .select("patient_id, date_time, status, patients:patient_id(name, status), profiles:nutritionist_id(full_name)")
    .eq("clinic_id", c.clinicId).neq("status", "cancelado")
    .gte("date_time", new Date(c.now.getTime() - 365 * DAY).toISOString())
    .order("date_time", { ascending: false }).limit(3000);
  if (isNutri(c)) q = q.eq("nutritionist_id", c.userId);
  type Row = { patient_id: string; date_time: string; status: string; patients: One<{ name?: string; status?: string }>; profiles: One<{ full_name?: string }> };
  const nowIso = c.now.toISOString();
  const byPatient = new Map<string, { name: string; nutri: string; active: boolean; lastVisit: string | null; hasFuture: boolean }>();
  for (const a of (check(await q).data ?? []) as unknown as Row[]) {
    const p = one(a.patients);
    const e = byPatient.get(a.patient_id) ?? { name: p?.name ?? "Paciente", nutri: one(a.profiles)?.full_name ?? "", active: p?.status === "ativo", lastVisit: null, hasFuture: false };
    if (a.date_time >= nowIso && a.status !== "nao_compareceu") e.hasFuture = true;
    if (a.status === "concluido" && (!e.lastVisit || a.date_time > e.lastVisit)) e.lastVisit = a.date_time;
    byPatient.set(a.patient_id, e);
  }
  const cutoff = new Date(c.now.getTime() - RETURN_AFTER_DAYS * DAY).toISOString();
  const due = [...byPatient.values()]
    .filter((e) => e.active && !e.hasFuture && e.lastVisit && e.lastVisit < cutoff)
    .sort((a, b) => a.lastVisit!.localeCompare(b.lastVisit!))
    .map((e) => ({
      patient: e.name,
      note: `${!isNutri(c) && e.nutri ? `${e.nutri} · ` : ""}Última consulta em ${fmtDayMonth(c.tz, e.lastVisit!)} · há ${daysBetween(e.lastVisit!, c.now)} dias`,
    }));
  return list(due);
}

async function fetchBirthdays(c: Ctx, days: Ymd[]): Promise<DigestList<DigestPatientNote>> {
  let q = c.admin.from("patients").select("name, birth_date")
    .eq("clinic_id", c.clinicId).eq("status", "ativo").not("birth_date", "is", null).limit(10000);
  if (isNutri(c)) q = q.eq("nutritionist_id", c.userId);
  const rows = (check(await q).data ?? []) as { name: string; birth_date: string }[];
  const weekly = days.length > 1;
  const out: { order: number; note: DigestPatientNote }[] = [];
  for (const r of rows) {
    const idx = days.findIndex((d) => d.slice(5) === r.birth_date.slice(5, 10));
    if (idx < 0) continue;
    const age = Number(days[idx].slice(0, 4)) - Number(r.birth_date.slice(0, 4));
    const when = weekly ? ` ${fmt("UTC", { weekday: "long" }).format(ymdNoon(days[idx]))} (${ymdToBr(days[idx])})` : " hoje";
    out.push({ order: idx, note: { patient: r.name, note: `Faz ${age} anos${when}` } });
  }
  out.sort((a, b) => a.order - b.order || a.note.patient.localeCompare(b.note.patient, "pt-BR"));
  return list(out.map((o) => o.note));
}

async function buildDaily(c: Ctx, firstName: string): Promise<DailyDigest> {
  const yesterday = addDays(c.today, -1);
  const [agenda, portalRequests, finance, clinical, returnsDue, birthdays, receivedYesterday] = await Promise.all([
    fetchAgenda(c, c.today, addDays(c.today, 1)),
    fetchPortalRequests(c),
    fetchFinance(c, c.today, c.today),
    isNutri(c) ? fetchClinical(c) : Promise.resolve(undefined),
    fetchReturnsDue(c),
    fetchBirthdays(c, [c.today]),
    isNutri(c) ? receivedBetween(c, yesterday, yesterday) : Promise.resolve(undefined),
  ]);
  return {
    audience: isNutri(c) ? "nutri" : "secretary",
    recipientFirstName: firstName,
    dateLabel: dateLabelOf(c.today),
    agenda: groupAgenda(c, agenda),
    portalRequests, finance, clinical, returnsDue, birthdays, receivedYesterday,
    preferencesUrl: PREFERENCES_URL,
  };
}

async function buildWeekly(c: Ctx, firstName: string): Promise<WeeklyDigest> {
  // Semana corrente de segunda a domingo (o semanal sai na segunda, mas o
  // exemplo pode ser pedido em qualquer dia).
  const wd = localNow(c.tz, ymdNoon(c.today)).weekday;
  const monday = addDays(c.today, -((wd + 6) % 7));
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const prevMonday = addDays(monday, -7), prevSunday = addDays(monday, -1);

  let lastWeekQ = c.admin.from("appointments").select("status")
    .eq("clinic_id", c.clinicId)
    .gte("date_time", localMidnight(c.tz, prevMonday).toISOString())
    .lt("date_time", localMidnight(c.tz, monday).toISOString()).limit(5000);
  if (isNutri(c)) lastWeekQ = lastWeekQ.eq("nutritionist_id", c.userId);
  let newPatientsQ = c.admin.from("patients").select("id", { count: "exact", head: true })
    .eq("clinic_id", c.clinicId)
    .gte("created_at", localMidnight(c.tz, prevMonday).toISOString())
    .lt("created_at", localMidnight(c.tz, monday).toISOString());
  if (isNutri(c)) newPatientsQ = newPatientsQ.eq("nutritionist_id", c.userId);

  const [agenda, portalRequests, finance, clinical, returnsDue, birthdays, lastWeek, newPatients, revenue, revenuePrev] = await Promise.all([
    fetchAgenda(c, monday, addDays(sunday, 1)),
    fetchPortalRequests(c),
    fetchFinance(c, c.today, sunday),
    isNutri(c) ? fetchClinical(c) : Promise.resolve(undefined),
    fetchReturnsDue(c),
    fetchBirthdays(c, days.filter((d) => d >= c.today)),
    lastWeekQ,
    newPatientsQ,
    isNutri(c) ? receivedBetween(c, prevMonday, prevSunday) : Promise.resolve(undefined),
    isNutri(c) ? receivedBetween(c, addDays(prevMonday, -7), addDays(prevMonday, -1)) : Promise.resolve(undefined),
  ]);
  const statuses = ((check(lastWeek).data ?? []) as { status: string }[]).map((r) => r.status);
  const held = statuses.filter((s) => s === "concluido").length;
  const noShow = statuses.filter((s) => s === "nao_compareceu").length;
  const cancelled = statuses.filter((s) => s === "cancelado").length;
  const scheduled = statuses.length - cancelled;

  const byDay = new Map<Ymd, ApptRow[]>(days.map((d) => [d, []]));
  for (const r of agenda) byDay.get(localNow(c.tz, new Date(r.date_time)).ymd)?.push(r);

  return {
    audience: isNutri(c) ? "nutri" : "secretary",
    recipientFirstName: firstName,
    dateLabel: dateLabelOf(c.today),
    weekLabel: weekLabelOf(monday, sunday),
    days: days.map((d) => ({
      label: capitalize(`${fmt("UTC", { weekday: "long" }).format(ymdNoon(d))}, ${ymdToBr(d)}`),
      groups: groupAgenda(c, byDay.get(d) ?? []),
    })),
    lastWeek: {
      held, noShow, cancelled,
      attendancePct: scheduled ? Math.round((held / scheduled) * 100) : null,
      newPatients: check(newPatients).count ?? 0,
      revenue, revenuePrev,
    },
    portalRequests, finance, clinical, returnsDue, birthdays,
    preferencesUrl: PREFERENCES_URL,
  };
}

// ---------------------------------------------------------------------------
// Destinatário e envio
// ---------------------------------------------------------------------------
const ROLE_ORDER = ["owner", "nutritionist", "secretary"] as const;

async function recipientContext(admin: SupabaseClient, userId: string, tz: string, now: Date) {
  const [{ data: profile }, { data: members }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("full_name, is_active").eq("id", userId).maybeSingle(),
    admin.from("clinic_members").select("clinic_id, role").eq("user_id", userId),
    admin.auth.admin.getUserById(userId),
  ]);
  const email = authUser?.user?.email;
  if (!profile || profile.is_active === false || !email) return null;
  const member = ((members ?? []) as { clinic_id: string; role: string }[])
    .filter((m) => (ROLE_ORDER as readonly string[]).includes(m.role))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role as Ctx["role"]) - ROLE_ORDER.indexOf(b.role as Ctx["role"]))[0];
  if (!member) return null;
  const ctx: Ctx = { admin, userId, clinicId: member.clinic_id, role: member.role as Ctx["role"], tz, today: localNow(tz, now).ymd, now };
  const firstName = (profile.full_name ?? "").trim().split(/\s+/)[0] || "tudo bem";
  return { ctx, email, firstName };
}

async function sendDigest(admin: SupabaseClient, userId: string, tz: string, kind: "daily" | "weekly", now: Date, subjectPrefix = "") {
  const r = await recipientContext(admin, userId, tz, now);
  if (!r) return { ok: false, reason: "sem destinatário" };
  const { subject, html, text } = kind === "weekly"
    ? renderWeeklyDigest(await buildWeekly(r.ctx, r.firstName))
    : renderDailyDigest(await buildDaily(r.ctx, r.firstName));
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REMETENTE, to: r.email, reply_to: RESPONDER_PARA, subject: subjectPrefix + subject, html, text }),
  });
  if (!res.ok) {
    console.error("[email-digest] Resend", res.status, await res.text());
    return { ok: false, reason: "falha no envio" };
  }
  return { ok: true };
}

type SettingsRow = {
  user_id: string; weekdays: number[]; send_time: string; weekly_enabled: boolean; timezone: string;
  last_daily_on: string | null; last_weekly_on: string | null;
};

async function runCron(admin: SupabaseClient) {
  const now = new Date();
  const { data, error } = await admin.from("email_digest_settings")
    .select("user_id, weekdays, send_time, weekly_enabled, timezone, last_daily_on, last_weekly_on")
    .eq("enabled", true);
  if (error) throw error;

  const results: { user_id: string; kind: string; ok: boolean; reason?: string }[] = [];
  for (const s of (data ?? []) as SettingsRow[]) {
    const tz = s.timezone || "America/Sao_Paulo";
    const local = localNow(tz, now);
    const [hh, mm] = s.send_time.split(":").map(Number);
    const since = local.minutes - (hh * 60 + mm);
    if (since < 0 || since >= SEND_WINDOW_MIN) continue;

    const weekly = s.weekly_enabled && local.weekday === 1;
    const kind = weekly ? "weekly" : "daily";
    if (!weekly && !s.weekdays.includes(local.weekday)) continue;
    const col = weekly ? "last_weekly_on" : "last_daily_on";
    const previous = weekly ? s.last_weekly_on : s.last_daily_on;
    if (previous === local.ymd) continue;

    // Reserva o envio de hoje antes de mandar (evita duplicar).
    const { data: claimed } = await admin.from("email_digest_settings")
      .update({ [col]: local.ymd })
      .eq("user_id", s.user_id)
      .or(`${col}.is.null,${col}.neq.${local.ymd}`)
      .select("user_id");
    if (!claimed?.length) continue;

    try {
      const r = await sendDigest(admin, s.user_id, tz, kind, now);
      if (!r.ok && r.reason === "falha no envio") {
        await admin.from("email_digest_settings").update({ [col]: previous }).eq("user_id", s.user_id);
      }
      results.push({ user_id: s.user_id, kind, ...r });
    } catch (err) {
      console.error("[email-digest]", s.user_id, err);
      await admin.from("email_digest_settings").update({ [col]: previous }).eq("user_id", s.user_id);
      results.push({ user_id: s.user_id, kind, ok: false, reason: "erro" });
    }
  }
  return results;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  let body: { mode?: string; kind?: string };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (body.mode === "cron") {
    const secret = Deno.env.get("DIGEST_CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Não autorizado." }, 401);
    try {
      const sent = await runCron(admin);
      return json({ ok: true, sent }, 200);
    } catch (err) {
      console.error("[email-digest] cron", err);
      return json({ error: "Falha ao processar." }, 500);
    }
  }

  if (body.mode === "preview") {
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autenticado." }, 401, origin);
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "Não autenticado." }, 401, origin);

    const { data: s } = await admin.from("email_digest_settings")
      .select("timezone, last_preview_at").eq("user_id", user.id).maybeSingle();
    if (s?.last_preview_at && Date.now() - new Date(s.last_preview_at).getTime() < 60_000) {
      return json({ error: "Aguarde um minuto para pedir outro exemplo." }, 429, origin);
    }
    await admin.from("email_digest_settings")
      .upsert({ user_id: user.id, last_preview_at: new Date().toISOString() }, { onConflict: "user_id" });

    try {
      const kind = body.kind === "weekly" ? "weekly" : "daily";
      const r = await sendDigest(admin, user.id, s?.timezone || "America/Sao_Paulo", kind, new Date(), "[Exemplo] ");
      if (!r.ok) return json({ error: r.reason === "sem destinatário" ? "Sua conta não está vinculada a uma clínica ativa." : "Não foi possível enviar o e-mail agora." }, 502, origin);
      return json({ ok: true, email: user.email }, 200, origin);
    } catch (err) {
      console.error("[email-digest] preview", err);
      return json({ error: "Não foi possível montar o resumo agora." }, 500, origin);
    }
  }

  return json({ error: "Modo inválido." }, 400, origin);
});
