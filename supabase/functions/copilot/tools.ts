// supabase/functions/copilot/tools.ts
// Ferramentas de LEITURA do co-piloto. Todas rodam com o client autenticado
// com o JWT de quem perguntou: o RLS decide o que aparece (isolamento por
// nutricionista, concessões, secretária sem prontuário). Nada aqui grava.
//
// Regras de saída (o resultado vai para o Google):
//   - nunca devolver CPF, e-mail, telefone, form_token, public_token, file_url;
//   - argumentos validados (UUID, datas YYYY-MM-DD, limites);
//   - textos longos cortados e resultado final limitado em tamanho.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface ToolContext {
  db: SupabaseClient;
  userId: string;
  clinicId: string;
  /** "Hoje" no fuso da clínica (YYYY-MM-DD). */
  today: string;
}

type Args = Record<string, unknown>;
type ToolResult = Record<string, unknown>;

// Brasil sem horário de verão desde 2019: offset fixo.
const TZ_OFFSET = "-03:00";
const MAX_RESULT_CHARS = 12_000;

const MEAL_NAMES: Record<string, string> = {
  breakfast: "Café da Manhã",
  morning_snack: "Lanche da Manhã",
  lunch: "Almoço",
  afternoon_snack: "Lanche da Tarde",
  pre_workout: "Pré-Treino",
  post_workout: "Pós-Treino",
  dinner: "Jantar",
  supper: "Ceia",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class ToolInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function uuidArg(args: Args, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    throw new ToolInputError(`'${key}' deve ser o id (UUID) retornado por buscar_pacientes.`);
  }
  return v;
}

function optDateArg(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ToolInputError(`'${key}' deve estar no formato AAAA-MM-DD.`);
  }
  return v;
}

function optString(args: Args, key: string, max = 80): string | undefined {
  const v = args[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

function intArg(args: Args, key: string, def: number, max: number): number {
  const n = Number(args[key]);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Início do dia local → ISO (para colunas timestamptz). */
const startOfDayIso = (ymd: string) => new Date(`${ymd}T00:00:00${TZ_OFFSET}`).toISOString();

/** Data/hora local legível (dd/mm/aaaa hh:mm) de um timestamptz. */
function localDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function localDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (DATE_RE.test(iso)) return iso.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(iso));
}

function ageFrom(birth: string | null | undefined, today: string): number | null {
  if (!birth || !DATE_RE.test(birth.slice(0, 10))) return null;
  const [by, bm, bd] = birth.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

function truncate(s: unknown, max: number): string | null {
  if (typeof s !== "string" || !s) return null;
  return s.length > max ? `${s.slice(0, max)}… [cortado]` : s;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const money = (n: number) => Math.round(n * 100) / 100;

function pickOne<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

/** Escapa os curingas do ILIKE e os separadores do filtro .or() do PostgREST. */
function likePattern(s: string): string {
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/[,()]/g, " ")}%`;
}

/** Antropometria: só campos primitivos, com IMC calculado quando possível. */
function anthropometry(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === "" || typeof v === "object") continue;
    out[k] = toNum(v) ?? truncate(String(v), 60);
  }
  const w = toNum(out.weight);
  let h = toNum(out.height);
  if (h && h > 3) h = h / 100; // altura em cm
  if (w && h) out.imc = Math.round((w / (h * h)) * 10) / 10;
  return Object.keys(out).length ? out : null;
}

const PATIENT_NOT_FOUND = {
  erro: "Paciente não encontrado ou sem acesso clínico para este usuário.",
};

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

async function buscarPacientes(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const nome = optString(args, "nome");
  const status = optString(args, "status");
  const limite = intArg(args, "limite", 15, 40);

  let q = ctx.db
    .from("patients")
    .select("id, name, birth_date, biological_sex, main_goal, status, nutritionist_id, has_clinical_access", { count: "exact" })
    .eq("clinic_id", ctx.clinicId)
    .order("name")
    .limit(limite);
  if (nome) q = q.ilike("name", likePattern(nome));
  if (status === "ativo" || status === "inativo") q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    total: count ?? data?.length ?? 0,
    pacientes: (data ?? []).map((p) => ({
      id: p.id,
      nome: p.name,
      idade: ageFrom(p.birth_date, ctx.today),
      sexo: p.biological_sex,
      objetivo: truncate(p.main_goal, 200),
      status: p.status,
      sou_responsavel: p.nutritionist_id === ctx.userId,
      acesso_clinico: p.has_clinical_access ?? false,
    })),
  };
}

async function loadPatient(ctx: ToolContext, patientId: string) {
  const { data, error } = await ctx.db
    .from("patients")
    .select("id, name, birth_date, biological_sex, main_goal, status, created_at, nutritionist_id, has_clinical_access, patient_health(*)")
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function resumoPaciente(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const id = uuidArg(args, "patient_id");
  const p = await loadPatient(ctx, id);
  if (!p) return PATIENT_NOT_FOUND;

  const cadastro = {
    id: p.id,
    nome: p.name,
    idade: ageFrom(p.birth_date, ctx.today),
    sexo: p.biological_sex,
    objetivo: truncate(p.main_goal, 400),
    status: p.status,
    paciente_desde: localDate(p.created_at),
    sou_responsavel: p.nutritionist_id === ctx.userId,
  };
  if (!p.has_clinical_access) {
    return { cadastro, aviso: "Sem acesso clínico a este paciente (prontuário, exames e planos indisponíveis)." };
  }

  const nowIso = new Date().toISOString();
  const [consults, plans, exams, nextAppt, lastAppt] = await Promise.all([
    ctx.db.from("consultations")
      .select("created_at, anamnese_notes, anthropometry_json", { count: "exact" })
      .eq("patient_id", id).order("created_at", { ascending: false }).limit(1),
    ctx.db.from("meal_plans").select("created_at, kcal")
      .eq("patient_id", id).order("created_at", { ascending: false }).limit(1),
    ctx.db.from("patient_exams").select("exam_date, created_at, ai_feedback")
      .eq("patient_id", id).order("exam_date", { ascending: false, nullsFirst: false }).limit(3),
    ctx.db.from("appointments").select("date_time, status")
      .eq("patient_id", id).gte("date_time", nowIso).neq("status", "cancelado")
      .order("date_time", { ascending: true }).limit(1),
    ctx.db.from("appointments").select("date_time, status")
      .eq("patient_id", id).lt("date_time", nowIso)
      .order("date_time", { ascending: false }).limit(1),
  ]);

  const health = pickOne(p.patient_health as Record<string, unknown> | Record<string, unknown>[] | null);
  const ficha = health
    ? {
      alergias: truncate(health.allergies, 300),
      restricoes: truncate(health.dietary_restrictions, 300),
      patologias: truncate(health.pathologies, 300),
      medicamentos: truncate(health.medications, 300),
      atividade_fisica: truncate(health.physical_activity_level, 120),
      profissao: truncate(health.profession, 120),
      sono: truncate(health.sleep_quality, 120),
    }
    : null;

  const last = consults.data?.[0];
  const plan = plans.data?.[0];
  const next = nextAppt.data?.[0];
  const prev = lastAppt.data?.[0];

  return {
    cadastro,
    ficha_saude: ficha,
    total_consultas: consults.count ?? 0,
    ultima_consulta: last
      ? {
        data: localDate(last.created_at),
        antropometria: anthropometry(last.anthropometry_json),
        anotacoes: truncate(last.anamnese_notes, 1500),
      }
      : null,
    plano_atual: plan ? { criado_em: localDate(plan.created_at), kcal: plan.kcal } : null,
    exames_recentes: (exams.data ?? []).map((e) => ({
      data: localDate(e.exam_date ?? e.created_at),
      analisado: !!e.ai_feedback,
      alertas: ((e.ai_feedback as { alertas?: Array<Record<string, unknown>> } | null)?.alertas ?? [])
        .slice(0, 10)
        .map((a) => ({ marcador: a.marcador, valor: a.valor, referencia: a.referencia, gravidade: a.gravidade })),
    })),
    proximo_agendamento: next ? { quando: localDateTime(next.date_time), status: next.status } : null,
    ultimo_agendamento: prev ? { quando: localDateTime(prev.date_time), status: prev.status } : null,
  };
}

async function evolucaoAntropometrica(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const id = uuidArg(args, "patient_id");
  const desde = optDateArg(args, "desde");

  let q = ctx.db.from("consultations")
    .select("created_at, anthropometry_json")
    .eq("patient_id", id)
    .order("created_at", { ascending: true })
    .limit(60);
  if (desde) q = q.gte("created_at", startOfDayIso(desde));
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) {
    const p = await loadPatient(ctx, id);
    if (!p || !p.has_clinical_access) return PATIENT_NOT_FOUND;
    return { medicoes: [], aviso: "Nenhuma consulta com antropometria no período." };
  }
  const medicoes = data
    .map((c) => ({ data: localDate(c.created_at), ...anthropometry(c.anthropometry_json) }))
    .filter((m) => Object.keys(m).length > 1);
  return { unidades: "peso em kg, altura em m ou cm, gordura e massa muscular como registrados", medicoes };
}

async function consultasPaciente(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const id = uuidArg(args, "patient_id");
  const limite = intArg(args, "limite", 5, 10);
  const { data, error } = await ctx.db.from("consultations")
    .select("created_at, anamnese_notes, anthropometry_json")
    .eq("patient_id", id)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  if (!data?.length) {
    const p = await loadPatient(ctx, id);
    if (!p || !p.has_clinical_access) return PATIENT_NOT_FOUND;
  }
  const perNote = limite > 5 ? 900 : 1600;
  return {
    consultas: (data ?? []).map((c) => ({
      data: localDate(c.created_at),
      antropometria: anthropometry(c.anthropometry_json),
      anotacoes: truncate(c.anamnese_notes, perNote),
    })),
  };
}

async function planoAlimentar(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const id = uuidArg(args, "patient_id");
  const { data, error } = await ctx.db.from("meal_plans")
    .select("id, created_at, kcal, meals")
    .eq("patient_id", id)
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) throw error;
  if (!data?.length) {
    const p = await loadPatient(ctx, id);
    if (!p || !p.has_clinical_access) return PATIENT_NOT_FOUND;
    return { plano_atual: null, aviso: "Paciente ainda não tem plano alimentar." };
  }
  const [current, ...older] = data;
  const meals = (current.meals ?? {}) as Record<string, Array<{ description?: string; items?: unknown; kcal?: number }>>;
  const refeicoes = Object.entries(meals).map(([key, options]) => ({
    refeicao: MEAL_NAMES[key] ?? key,
    opcoes: (Array.isArray(options) ? options : []).slice(0, 4).map((o) => ({
      descricao: truncate(o.description, 120),
      itens: Array.isArray(o.items)
        ? o.items.slice(0, 12).map((i) => truncate(typeof i === "string" ? i : (i as { description?: string })?.description, 120))
        : [],
      kcal: o.kcal ?? null,
    })),
  }));
  return {
    plano_atual: { criado_em: localDate(current.created_at), kcal_total: current.kcal, refeicoes },
    planos_anteriores: older.map((pl) => ({ criado_em: localDate(pl.created_at), kcal: pl.kcal })),
  };
}

async function examesPaciente(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const id = uuidArg(args, "patient_id");
  const limite = intArg(args, "limite", 4, 8);
  const { data, error } = await ctx.db.from("patient_exams")
    .select("exam_date, created_at, ai_feedback")
    .eq("patient_id", id)
    .order("exam_date", { ascending: false, nullsFirst: false })
    .limit(limite);
  if (error) throw error;
  if (!data?.length) {
    const p = await loadPatient(ctx, id);
    if (!p || !p.has_clinical_access) return PATIENT_NOT_FOUND;
    return { exames: [], aviso: "Nenhum exame enviado." };
  }
  type Bio = { marcador?: string; valor?: string; referencia?: string; status?: string; gravidade?: string; nota_clinica?: string };
  const slim = (b: Bio) => ({ marcador: b.marcador, valor: b.valor, referencia: b.referencia, status: b.status, gravidade: b.gravidade });
  return {
    exames: data.map((e, i) => {
      const fb = e.ai_feedback as {
        alertas?: Bio[]; insights?: string; todos_biomarcadores?: Bio[]; focos_sugeridos?: string[];
      } | null;
      if (!fb) return { data: localDate(e.exam_date ?? e.created_at), analisado: false };
      return {
        data: localDate(e.exam_date ?? e.created_at),
        analisado: true,
        alertas: (fb.alertas ?? []).slice(0, 15).map((a) => ({ ...slim(a), nota: truncate(a.nota_clinica, 200) })),
        // Biomarcadores completos só do exame mais recente (economia de contexto).
        biomarcadores: i === 0 ? (fb.todos_biomarcadores ?? []).slice(0, 50).map(slim) : undefined,
        parecer: truncate(fb.insights, i === 0 ? 1200 : 400),
        focos_sugeridos: (fb.focos_sugeridos ?? []).slice(0, 6),
      };
    }),
  };
}

async function agenda(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const de = optDateArg(args, "de") ?? ctx.today;
  let ate = optDateArg(args, "ate") ?? de;
  if (ate < de) ate = de;
  if (ate > addDays(de, 62)) ate = addDays(de, 62);
  const status = optString(args, "status");
  const apenasMeus = args.apenas_meus !== false;

  let q = ctx.db.from("appointments")
    .select("date_time, status, patient_id, nutritionist_id, patients:patient_id(name), services:service_id(name, duration_minutes), profiles:nutritionist_id(full_name)")
    .eq("clinic_id", ctx.clinicId)
    .gte("date_time", startOfDayIso(de))
    .lt("date_time", startOfDayIso(addDays(ate, 1)))
    .order("date_time", { ascending: true })
    .limit(120);
  if (apenasMeus) q = q.eq("nutritionist_id", ctx.userId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;

  const rows = data ?? [];
  const porStatus: Record<string, number> = {};
  for (const a of rows) porStatus[a.status] = (porStatus[a.status] ?? 0) + 1;

  return {
    periodo: { de: localDate(de), ate: localDate(ate) },
    escopo: apenasMeus ? "somente os meus atendimentos" : "clínica inteira",
    total: rows.length,
    por_status: porStatus,
    agendamentos: rows.map((a) => {
      const svc = pickOne(a.services as { name?: string; duration_minutes?: number } | null);
      return {
        quando: localDateTime(a.date_time),
        status: a.status,
        paciente: pickOne(a.patients as { name?: string } | null)?.name ?? "(paciente de outro profissional)",
        patient_id: a.patient_id,
        servico: svc?.name ?? null,
        duracao_min: svc?.duration_minutes ?? null,
        profissional: apenasMeus ? undefined : pickOne(a.profiles as { full_name?: string } | null)?.full_name ?? null,
      };
    }),
  };
}

function monthDefaults(args: Args, today: string) {
  const de = optDateArg(args, "de") ?? `${today.slice(0, 8)}01`;
  let ate = optDateArg(args, "ate");
  if (!ate) {
    const [y, m] = de.split("-").map(Number);
    ate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // último dia do mês de `de`
  }
  if (ate < de) ate = de;
  if (ate > addDays(de, 400)) ate = addDays(de, 400);
  return { de, ate };
}

async function financeiroResumo(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const { de, ate } = monthDefaults(args, ctx.today);
  const inRange = `and(due_date.gte.${de},due_date.lte.${ate}),and(paid_at.gte.${de},paid_at.lte.${ate})`;

  const [pay, overdue, exp] = await Promise.all([
    ctx.db.from("payments").select("status, net_amount, method, due_date, paid_at")
      .eq("clinic_id", ctx.clinicId).or(inRange).limit(2000),
    ctx.db.from("payments").select("net_amount")
      .eq("clinic_id", ctx.clinicId).eq("status", "pendente").lt("due_date", ctx.today).limit(2000),
    ctx.db.from("expenses").select("status, amount, category, due_date, paid_at")
      .eq("clinic_id", ctx.clinicId).or(inRange).limit(2000),
  ]);
  if (pay.error) throw pay.error;

  let recebido = 0, aReceber = 0, canceladoQtd = 0;
  const porForma: Record<string, number> = {};
  for (const p of pay.data ?? []) {
    const v = Number(p.net_amount) || 0;
    if (p.status === "pago" && p.paid_at && p.paid_at >= de && p.paid_at <= ate) {
      recebido += v;
      const k = p.method ?? "outro";
      porForma[k] = money((porForma[k] ?? 0) + v);
    } else if (p.status === "pendente" && p.due_date >= de && p.due_date <= ate) {
      aReceber += v;
    } else if (p.status === "cancelado") {
      canceladoQtd++;
    }
  }
  const vencidoTotal = (overdue.data ?? []).reduce((s, p) => s + (Number(p.net_amount) || 0), 0);

  let despesas: ToolResult | null = null;
  if (!exp.error) {
    let pagas = 0, pendentes = 0;
    const porCategoria: Record<string, number> = {};
    for (const e of exp.data ?? []) {
      const v = Number(e.amount) || 0;
      if (e.status === "pago" && e.paid_at && e.paid_at >= de && e.paid_at <= ate) {
        pagas += v;
        porCategoria[e.category] = money((porCategoria[e.category] ?? 0) + v);
      } else if (e.status === "pendente" && e.due_date >= de && e.due_date <= ate) {
        pendentes += v;
      }
    }
    despesas = { pagas: money(pagas), pendentes_no_periodo: money(pendentes), pagas_por_categoria: porCategoria };
  }

  return {
    moeda: "BRL",
    periodo: { de: localDate(de), ate: localDate(ate) },
    receitas: {
      recebido: money(recebido),
      a_receber_no_periodo: money(aReceber),
      recebido_por_forma: porForma,
      cobrancas_canceladas: canceladoQtd,
    },
    vencido_em_aberto_total: { valor: money(vencidoTotal), cobrancas: overdue.data?.length ?? 0 },
    despesas,
    saldo_caixa: despesas ? money(recebido - (despesas.pagas as number)) : null,
  };
}

async function pagamentos(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const filtro = optString(args, "filtro") ?? "a_receber";
  const limite = intArg(args, "limite", 20, 40);
  const patientId = args.patient_id ? uuidArg(args, "patient_id") : undefined;
  const de = optDateArg(args, "de");
  const ate = optDateArg(args, "ate");

  let q = ctx.db.from("payments")
    .select("description, net_amount, status, method, due_date, paid_at, patient_id, payment_patient_name")
    .eq("clinic_id", ctx.clinicId)
    .limit(limite);
  if (patientId) q = q.eq("patient_id", patientId);

  if (filtro === "vencidos") {
    q = q.eq("status", "pendente").lt("due_date", ctx.today).order("due_date", { ascending: true });
  } else if (filtro === "pagos") {
    q = q.eq("status", "pago").order("paid_at", { ascending: false });
    if (de) q = q.gte("paid_at", de);
    if (ate) q = q.lte("paid_at", ate);
  } else if (filtro === "cancelados") {
    q = q.eq("status", "cancelado").order("due_date", { ascending: false });
  } else if (filtro === "todos") {
    q = q.order("due_date", { ascending: false });
    if (de) q = q.gte("due_date", de);
    if (ate) q = q.lte("due_date", ate);
  } else {
    q = q.eq("status", "pendente").order("due_date", { ascending: true });
    if (de) q = q.gte("due_date", de);
    if (ate) q = q.lte("due_date", ate);
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    filtro,
    moeda: "BRL",
    cobrancas: (data ?? []).map((p) => ({
      paciente: (p as { payment_patient_name?: string }).payment_patient_name ?? null,
      patient_id: p.patient_id,
      descricao: truncate(p.description, 120),
      valor: money(Number(p.net_amount) || 0),
      status: p.status,
      vencimento: localDate(p.due_date),
      pago_em: localDate(p.paid_at),
      forma: p.method,
      vencido: p.status === "pendente" && p.due_date < ctx.today,
    })),
  };
}

async function lembretes(ctx: ToolContext, args: Args): Promise<ToolResult> {
  const incluirConcluidos = args.incluir_concluidos === true;
  let q = ctx.db.from("reminders")
    .select("description, due_date, is_completed, user_id, profiles:user_id(full_name)")
    .eq("clinic_id", ctx.clinicId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(30);
  if (!incluirConcluidos) q = q.eq("is_completed", false);
  const { data, error } = await q;
  if (error) throw error;
  return {
    lembretes: (data ?? []).map((r) => ({
      descricao: truncate(r.description, 200),
      prazo: localDate(r.due_date),
      concluido: r.is_completed,
      atrasado: !r.is_completed && !!r.due_date && r.due_date.slice(0, 10) < ctx.today,
      criado_por: r.user_id === ctx.userId ? "eu" : pickOne(r.profiles as { full_name?: string } | null)?.full_name ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Catálogo (function declarations do Gemini) + despacho
// ---------------------------------------------------------------------------

const PATIENT_ID = { type: "string", description: "id (UUID) do paciente, obtido com buscar_pacientes" };
const DATE = (d: string) => ({ type: "string", description: `${d} (AAAA-MM-DD)` });

export const TOOL_DECLARATIONS = [
  {
    name: "buscar_pacientes",
    description: "Busca pacientes da clínica pelo nome (parcial). Use SEMPRE antes das ferramentas que pedem patient_id quando o usuário citar um nome. Sem nome, lista os pacientes.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome ou parte do nome" },
        status: { type: "string", enum: ["ativo", "inativo"] },
        limite: { type: "integer", description: "Máximo de resultados (padrão 15, máx. 40)" },
      },
    },
  },
  {
    name: "resumo_paciente",
    description: "Visão geral de um paciente: cadastro, ficha de saúde (alergias, patologias, medicamentos), última consulta e antropometria, plano atual, alertas dos exames recentes, próximo e último agendamento.",
    parameters: { type: "object", properties: { patient_id: PATIENT_ID }, required: ["patient_id"] },
  },
  {
    name: "evolucao_antropometrica",
    description: "Série histórica de medidas (peso, altura, IMC, % gordura, massa muscular) registradas nas consultas, em ordem cronológica.",
    parameters: {
      type: "object",
      properties: { patient_id: PATIENT_ID, desde: DATE("Data inicial opcional") },
      required: ["patient_id"],
    },
  },
  {
    name: "consultas_paciente",
    description: "Anotações (anamnese/prontuário) e medidas das consultas mais recentes do paciente.",
    parameters: {
      type: "object",
      properties: { patient_id: PATIENT_ID, limite: { type: "integer", description: "Quantas consultas (padrão 5, máx. 10)" } },
      required: ["patient_id"],
    },
  },
  {
    name: "plano_alimentar",
    description: "Plano alimentar atual do paciente (refeições, opções, itens e kcal) e datas/kcal dos planos anteriores.",
    parameters: { type: "object", properties: { patient_id: PATIENT_ID }, required: ["patient_id"] },
  },
  {
    name: "exames_paciente",
    description: "Exames laboratoriais do paciente já analisados: alertas (marcadores alterados), biomarcadores do exame mais recente, parecer e focos sugeridos.",
    parameters: {
      type: "object",
      properties: { patient_id: PATIENT_ID, limite: { type: "integer", description: "Quantos exames (padrão 4, máx. 8)" } },
      required: ["patient_id"],
    },
  },
  {
    name: "agenda",
    description: "Agendamentos num intervalo de datas (máx. 62 dias). Status possíveis: pendente, confirmado, concluido, cancelado, nao_compareceu. Por padrão só os atendimentos do próprio usuário.",
    parameters: {
      type: "object",
      properties: {
        de: DATE("Data inicial; padrão hoje"),
        ate: DATE("Data final inclusiva; padrão igual a 'de'"),
        status: { type: "string", enum: ["pendente", "confirmado", "concluido", "cancelado", "nao_compareceu"] },
        apenas_meus: { type: "boolean", description: "false para ver a agenda da clínica inteira" },
      },
    },
  },
  {
    name: "financeiro_resumo",
    description: "Totais financeiros de um período: recebido, a receber, recebido por forma de pagamento, total vencido em aberto, despesas pagas/pendentes por categoria e saldo de caixa. Padrão: mês atual.",
    parameters: {
      type: "object",
      properties: { de: DATE("Data inicial; padrão dia 1 do mês atual"), ate: DATE("Data final; padrão fim do mês de 'de'") },
    },
  },
  {
    name: "pagamentos",
    description: "Lista de cobranças de pacientes. Filtros: a_receber (padrão), vencidos, pagos, cancelados, todos.",
    parameters: {
      type: "object",
      properties: {
        filtro: { type: "string", enum: ["a_receber", "vencidos", "pagos", "cancelados", "todos"] },
        patient_id: PATIENT_ID,
        de: DATE("Data inicial opcional"),
        ate: DATE("Data final opcional"),
        limite: { type: "integer", description: "Máximo (padrão 20, máx. 40)" },
      },
    },
  },
  {
    name: "lembretes",
    description: "Lembretes/tarefas da equipe da clínica (com quem criou; 'eu' = o usuário).",
    parameters: {
      type: "object",
      properties: { incluir_concluidos: { type: "boolean" } },
    },
  },
] as const;

const HANDLERS: Record<string, (ctx: ToolContext, args: Args) => Promise<ToolResult>> = {
  buscar_pacientes: buscarPacientes,
  resumo_paciente: resumoPaciente,
  evolucao_antropometrica: evolucaoAntropometrica,
  consultas_paciente: consultasPaciente,
  plano_alimentar: planoAlimentar,
  exames_paciente: examesPaciente,
  agenda,
  financeiro_resumo: financeiroResumo,
  pagamentos,
  lembretes,
};

/** Executa uma ferramenta e devolve um objeto sempre serializável e limitado. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return { erro: `Ferramenta desconhecida: ${name}` };
  const args = (rawArgs && typeof rawArgs === "object" ? rawArgs : {}) as Args;
  try {
    const result = await handler(ctx, args);
    const text = JSON.stringify(result);
    if (text.length <= MAX_RESULT_CHARS) return result;
    return { aviso: "Resultado longo foi cortado; refine a pergunta se faltar algo.", dados_parciais: text.slice(0, MAX_RESULT_CHARS) };
  } catch (err) {
    if (err instanceof ToolInputError) return { erro: err.message };
    const msg = (err as { message?: string })?.message ?? String(err);
    console.error(`copilot tool "${name}":`, msg);
    return { erro: "Não foi possível consultar esses dados agora." };
  }
}
