// supabase/functions/patient-copilot/index.ts
// Assistente do paciente no Portal: receitas e trocas a partir do plano,
// lista de compras, comer fora e "como estou indo" pelo diário alimentar.
//
// Diferente do co-piloto da equipe (tool calling), aqui o universo de dados é
// pequeno e fixo — o próprio paciente —, então o retrato inteiro vai no prompt
// e há uma única chamada ao Gemini. Tudo é lido com o JWT do paciente: o RLS
// e as RPCs do portal garantem que ele só vê os próprios dados.
//
// Só leitura; a conversa não é persistida (o histórico vem do cliente).
// Cota diária própria: register_patient_copilot (migration 0037), que também
// recusa a equipe e o paciente com acesso vencido.
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS (csv), PATIENT_COPILOT_DAILY_LIMIT (int, padrão 40),
//            GEMINI_MODEL_PATIENT_COPILOT (modelo primário).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { buildPatientPrompt } from "./prompt.ts";

const BASE_ORIGINS = [
  "https://nutri-ai.io",
  "https://www.nutri-ai.io",
  "https://dtkoegdmmhnxsrrxmoiq.supabase.co",
  "https://nutri-ai-self-nine.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];
const EXTRA_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...BASE_ORIGINS, ...EXTRA_ORIGINS];

const MAX_BODY_BYTES = 48 * 1024;
const MAX_HISTORY_MESSAGES = 16;
const MAX_HISTORY_CHARS = 24_000;
const MAX_MESSAGE_CHARS = 2_000;
const DIARY_DAYS = 7;
const TIMEOUT_MS = 40_000;
const DAILY_LIMIT = Number(Deno.env.get("PATIENT_COPILOT_DAILY_LIMIT") ?? "40");

const MODEL_CHAIN = [
  ...new Set([Deno.env.get("GEMINI_MODEL_PATIENT_COPILOT") ?? "gemini-3.6-flash", "gemini-3.5-flash"]),
];

const MEAL_NAMES: Record<string, string> = {
  breakfast: "Café da manhã",
  morning_snack: "Lanche da manhã",
  lunch: "Almoço",
  afternoon_snack: "Lanche da tarde",
  pre_workout: "Pré-treino",
  post_workout: "Pós-treino",
  dinner: "Jantar",
  supper: "Ceia",
};
const MEAL_ORDER = Object.keys(MEAL_NAMES);

const ADHERENCE_LABELS: Record<string, string> = {
  segue_o_plano: "segue o plano",
  parcial: "parcial",
  fora_do_plano: "fora do plano",
  sem_plano: "sem plano",
};

function cors(origin: string): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function isModelUnavailable(status: number, detail: string): boolean {
  if (status === 404) return true;
  return /not[_ ]?found|deprecat|no longer (available|supported)|has been removed|unsupported model|unknown model/i
    .test(detail);
}

const sp = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });

/** Hoje/agora no fuso da clínica. */
function nowInSaoPaulo() {
  const parts = Object.fromEntries(
    sp({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** timestamptz → YYYY-MM-DD local. */
function localYmd(iso: string): string {
  const p = Object.fromEntries(sp({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const localHm = (iso: string) => sp({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const dm = (ymd: string) => ymd.slice(5).split("-").reverse().join("/");

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const clip = (s: unknown, max: number) => {
  if (typeof s !== "string") return "";
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

interface ChatMessage { role: "user" | "model"; text: string }

/** Valida e corta o histórico vindo do cliente (últimas N mensagens, teto de caracteres). */
function sanitizeHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const msgs: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, text } = m as { role?: unknown; text?: unknown };
    if ((role !== "user" && role !== "model") || typeof text !== "string" || !text.trim()) return null;
    msgs.push({ role, text: text.slice(0, MAX_MESSAGE_CHARS) });
  }
  let kept = msgs.slice(-MAX_HISTORY_MESSAGES);
  while (kept.length > 1 && kept.reduce((n, m) => n + m.text.length, 0) > MAX_HISTORY_CHARS) {
    kept = kept.slice(1);
  }
  while (kept.length && kept[0].role !== "user") kept = kept.slice(1);
  if (!kept.length || kept[kept.length - 1].role !== "user") return null;
  return kept;
}

type MealOption = { description?: string; items?: string[]; kcal?: number };
type Macros = { kcal?: number; protein?: number; carbs?: number; fat?: number };
type LogItem = { name?: string; quantity?: string };

/**
 * Retrato do paciente para o prompt: perfil, ficha (só o que pesa na comida),
 * plano atual, diário dos últimos dias (com totais já somados — o modelo não
 * faz conta) e a próxima consulta.
 */
async function buildDataBlock(db: SupabaseClient, patientId: string, ctx: Record<string, unknown>, today: string) {
  const from = addDays(today, -(DIARY_DAYS - 1));
  const [{ data: plan }, { data: health }, { data: logs }, { data: appts }] = await Promise.all([
    db.from("meal_plans").select("kcal, meals, created_at")
      .eq("patient_id", patientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("patient_health").select("allergies, dietary_restrictions, pathologies, physical_activity_level")
      .eq("patient_id", patientId).maybeSingle(),
    db.from("meal_logs").select("eaten_at, meal_key, items, macros, adherence, consumed_pct")
      .eq("patient_id", patientId).eq("status", "completed")
      .gte("eaten_at", new Date(`${from}T00:00:00-03:00`).toISOString())
      .order("eaten_at", { ascending: true }).limit(80),
    db.rpc("portal_appointments"),
  ]);

  const out: string[] = [];

  // Perfil
  const profile: string[] = [];
  if (ctx.main_goal) profile.push(`Objetivo: ${clip(ctx.main_goal, 200)}`);
  if (ctx.biological_sex) profile.push(`Sexo: ${ctx.biological_sex}`);
  if (typeof ctx.birth_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(ctx.birth_date)) {
    const [by, bm, bd] = ctx.birth_date.slice(0, 10).split("-").map(Number);
    const [ty, tm, td] = today.split("-").map(Number);
    profile.push(`Idade: ${ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)} anos`);
  }
  out.push(`## Perfil\n${profile.length ? profile.join("\n") : "Sem dados."}`);

  // Ficha
  const h = health as Record<string, string | null> | null;
  const fichaLines = [
    ["Alergias/intolerâncias", h?.allergies],
    ["Restrições alimentares", h?.dietary_restrictions],
    ["Condições de saúde informadas", h?.pathologies],
    ["Atividade física", h?.physical_activity_level],
  ].filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => `${k}: ${clip(v, 400)}`);
  out.push(`## Ficha de saúde\n${fichaLines.length ? fichaLines.join("\n") : "Não preenchida (nenhuma alergia ou restrição informada)."}`);

  // Plano
  if (plan) {
    const meals = (plan.meals ?? {}) as Record<string, MealOption[]>;
    const keys = Object.keys(meals).sort((a, b) => MEAL_ORDER.indexOf(a) - MEAL_ORDER.indexOf(b));
    const lines = [`Publicado em ${dm(localYmd(plan.created_at))}. Meta: ${plan.kcal ? `${num(plan.kcal)} kcal/dia` : "não informada"}.`];
    for (const k of keys) {
      const opts = meals[k] ?? [];
      if (!opts.length) continue;
      lines.push(`### ${MEAL_NAMES[k] ?? k}`);
      opts.forEach((o, i) => {
        const items = (o.items ?? []).map((it) => clip(it, 120)).filter(Boolean).join("; ");
        lines.push(`- Opção ${i + 1}${o.description ? ` (${clip(o.description, 80)})` : ""}: ${items || "sem itens"}${o.kcal ? ` — ~${num(o.kcal)} kcal` : ""}`);
      });
    }
    out.push(`## Plano alimentar atual\n${lines.join("\n")}`);
  } else {
    out.push("## Plano alimentar atual\nAinda não há plano publicado pelo nutricionista.");
  }

  // Diário
  const rows = (logs ?? []) as Array<{ eaten_at: string; meal_key: string | null; items: LogItem[] | null; macros: Macros | null; adherence: string | null; consumed_pct: number | null }>;
  if (rows.length) {
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) {
      const d = localYmd(r.eaten_at);
      byDay.set(d, [...(byDay.get(d) ?? []), r]);
    }
    const lines: string[] = [];
    for (let d = from; d <= today; d = addDays(d, 1)) {
      const dayRows = byDay.get(d);
      if (!dayRows) { lines.push(`- ${dm(d)}: nada registrado`); continue; }
      const t = dayRows.reduce((a, r) => ({
        kcal: a.kcal + num(r.macros?.kcal), protein: a.protein + num(r.macros?.protein),
        carbs: a.carbs + num(r.macros?.carbs), fat: a.fat + num(r.macros?.fat),
      }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
      lines.push(`- ${dm(d)}${d === today ? " (hoje)" : ""}: ${dayRows.length} registro(s), total ${t.kcal} kcal, P ${t.protein} g, C ${t.carbs} g, G ${t.fat} g`);
      for (const r of dayRows) {
        const items = (r.items ?? []).slice(0, 8).map((it) => `${clip(it.name, 40)}${it.quantity ? ` ${clip(it.quantity, 20)}` : ""}`).join(", ");
        const pct = r.consumed_pct && r.consumed_pct < 1 ? `, comeu ${Math.round(r.consumed_pct * 100)}%` : "";
        lines.push(`  - ${localHm(r.eaten_at)} ${r.meal_key ? MEAL_NAMES[r.meal_key] ?? r.meal_key : "Refeição"}: ${items || "sem itens"} — ${num(r.macros?.kcal)} kcal${pct}${r.adherence ? ` [${ADHERENCE_LABELS[r.adherence] ?? r.adherence}]` : ""}`);
      }
    }
    const counts = rows.reduce<Record<string, number>>((a, r) => {
      if (r.adherence) a[r.adherence] = (a[r.adherence] ?? 0) + 1;
      return a;
    }, {});
    const summary = Object.entries(counts).map(([k, n]) => `${ADHERENCE_LABELS[k] ?? k}: ${n}`).join(", ");
    out.push(`## Diário alimentar (${dm(from)} a ${dm(today)}; totais já somados)\n${lines.join("\n")}${summary ? `\nAderência das refeições registradas — ${summary}.` : ""}\nO diário só tem o que o paciente registrou; dias sem registro não significam que não comeu.`);
  } else {
    out.push(`## Diário alimentar\nNenhuma refeição registrada de ${dm(from)} a ${dm(today)}.`);
  }

  // Próxima consulta
  const now = Date.now();
  const next = ((appts ?? []) as Array<{ date_time: string; status: string }>)
    .filter((a) => new Date(a.date_time).getTime() > now && (a.status === "pendente" || a.status === "confirmado"))
    .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];
  out.push(`## Próxima consulta\n${next ? `${dm(localYmd(next.date_time))} às ${localHm(next.date_time)} (${next.status})` : "Nenhuma marcada."}`);

  return out.join("\n\n");
}

class UpstreamError extends Error {
  constructor(readonly status: number) { super(`upstream ${status}`); }
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  // 1. Autenticação
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado." }, 401, origin);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401, origin);

  // 2. Corpo
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_BODY_BYTES) return json({ error: "Mensagem muito grande." }, 413, origin);
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) return json({ error: "Mensagem muito grande." }, 413, origin);
  let body: { messages?: unknown };
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  const history = sanitizeHistory(body.messages);
  if (!history) return json({ error: "Conversa inválida." }, 400, origin);

  // 3. Quem é (só paciente do portal) + cota (recusa acesso vencido)
  const { data: portal } = await db.rpc("portal_context");
  const ctx = portal as Record<string, unknown> | null;
  if (!ctx?.patient_id) return json({ error: "O assistente é exclusivo do app do paciente." }, 403, origin);

  const { error: quotaError } = await db.rpc("register_patient_copilot", { p_daily_limit: DAILY_LIMIT });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    const status = code === "53400" ? 429 : code === "28000" ? 401 : 403;
    return json({ error: quotaError.message || "Sem permissão para usar o assistente." }, status, origin);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("patient-copilot: GEMINI_API_KEY ausente");
    return json({ error: "Serviço de IA indisponível." }, 502, origin);
  }

  // 4. Prompt com o retrato do paciente
  const now = nowInSaoPaulo();
  let data: string;
  try {
    data = await buildDataBlock(db, String(ctx.patient_id), ctx, now.today);
  } catch (err) {
    console.error("patient-copilot dados:", err instanceof Error ? err.message : String(err));
    return json({ error: "Não foi possível carregar seus dados agora. Tente de novo." }, 502, origin);
  }
  const systemInstruction = {
    role: "system",
    parts: [{
      text: buildPatientPrompt({
        today: now.today,
        weekday: now.weekday,
        nowTime: now.time,
        firstName: String(ctx.name ?? "").split(/\s+/)[0] || "você",
        nutritionistName: typeof ctx.nutritionist_name === "string" && ctx.nutritionist_name ? ctx.nutritionist_name : "seu nutricionista",
        data,
      }),
    }],
  };

  // 5. Uma chamada ao Gemini (com troca de modelo se o primário sumir)
  const payload = {
    contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    systemInstruction,
    generationConfig: { temperature: 0.6 },
  };
  try {
    for (let i = 0; i < MODEL_CHAIN.length; i++) {
      const model = MODEL_CHAIN[i];
      const hasNext = i < MODEL_CHAIN.length - 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err) {
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        console.error(`patient-copilot fetch (${model}):`, timedOut ? "timeout" : String(err));
        if (hasNext && !timedOut) continue;
        throw new UpstreamError(timedOut ? 504 : 502);
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (hasNext && isModelUnavailable(res.status, detail)) {
          console.error(`patient-copilot: modelo "${model}" indisponível (${res.status}), tentando "${MODEL_CHAIN[i + 1]}"`);
          continue;
        }
        console.error(`patient-copilot upstream (${model}):`, res.status, detail.slice(0, 500));
        throw new UpstreamError(res.status === 429 ? 429 : 502);
      }
      const out = await res.json();
      const text = ((out.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>)
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      console.log(`patient-copilot ok: ${Date.now() - started}ms (${model})`);
      if (!text) throw new UpstreamError(502);
      return json({ text }, 200, origin);
    }
    throw new UpstreamError(502);
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    if (!(err instanceof UpstreamError)) console.error("patient-copilot:", err instanceof Error ? err.message : String(err));
    return json({ error: "O assistente não conseguiu responder agora. Tente de novo em instantes." }, status, origin);
  }
});
