// supabase/functions/copilot/index.ts
// Co-piloto do nutricionista: chat que responde sobre pacientes, planos,
// consultas, agenda, financeiro e exames.
//
// Como funciona: o Gemini recebe um catálogo de ferramentas de LEITURA
// (tools.ts). Quando pede uma, ela é executada aqui com um client Supabase
// autenticado com o JWT de quem perguntou — o RLS decide o que aparece, então
// o co-piloto enxerga exatamente o que o usuário veria nas telas. Nada é
// gravado e a conversa não é persistida (o histórico vem do cliente).
//
// Mesmo hardening do gemini-proxy: CORS estrito, status HTTP reais sem vazar
// erro do upstream, limite de corpo e quota diária via register_ai_call (que
// também barra paciente/secretária). A quota conta 1 por mensagem do usuário,
// não por volta do loop de ferramentas.
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS (csv), AI_COPILOT_DAILY_LIMIT (int, padrão 100),
//            GEMINI_MODEL_COPILOT (modelo primário),
//            COPILOT_THINKING_LEVEL ("low" | "high"; omitido = padrão do modelo).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runTool, TOOL_DECLARATIONS, type ToolContext } from "./tools.ts";
import { buildSystemPrompt } from "./prompt.ts";

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

const MAX_BODY_BYTES = 64 * 1024;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 30_000;
const MAX_MESSAGE_CHARS = 4_000;
const MAX_TOOL_ROUNDS = 6;
const SOFT_DEADLINE_MS = 45_000;
const AI_DAILY_LIMIT = Number(Deno.env.get("AI_COPILOT_DAILY_LIMIT") ?? "100");
const THINKING_LEVEL = Deno.env.get("COPILOT_THINKING_LEVEL");

const MODEL_CHAIN = [
  ...new Set([Deno.env.get("GEMINI_MODEL_COPILOT") ?? "gemini-3.6-flash", "gemini-3.5-flash"]),
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rótulos amigáveis das ferramentas para o "consultei: …" do painel.
const STEP_LABELS: Record<string, string> = {
  buscar_pacientes: "pacientes",
  resumo_paciente: "ficha do paciente",
  evolucao_antropometrica: "medidas",
  consultas_paciente: "consultas",
  plano_alimentar: "plano alimentar",
  exames_paciente: "exames",
  agenda: "agenda",
  financeiro_resumo: "financeiro",
  pagamentos: "recebimentos",
  lembretes: "lembretes",
};

function baseCors(origin: string): Record<string, string> {
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
    headers: { ...baseCors(origin), "Content-Type": "application/json" },
  });
}

// SQLSTATE -> HTTP para os erros levantados por register_ai_call
function statusForPgCode(code?: string): number {
  if (code === "53400") return 429;
  if (code === "42501") return 403;
  if (code === "28000") return 401;
  return 403;
}

function isModelUnavailable(status: number, detail: string): boolean {
  if (status === 404) return true;
  return /not[_ ]?found|deprecat|no longer (available|supported)|has been removed|unsupported model|unknown model/i
    .test(detail);
}

/** Hoje/agora no fuso da clínica. */
function nowInSaoPaulo() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    time: `${parts.hour}:${parts.minute}`,
  };
}

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
  // O Gemini exige que a conversa comece pelo usuário e a última vez seja dele.
  while (kept.length && kept[0].role !== "user") kept = kept.slice(1);
  if (!kept.length || kept[kept.length - 1].role !== "user") return null;
  return kept;
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
};
type GeminiContent = { role: string; parts: Array<Record<string, unknown>> };

class UpstreamError extends Error {
  constructor(readonly status: number) { super(`upstream ${status}`); }
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") return new Response("ok", { headers: baseCors(origin) });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  // 1. Autenticação do chamador
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Token de autenticação ausente." }, 401, origin);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return json({ error: "Usuário não autenticado." }, 401, origin);

  // 2. Corpo
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_BODY_BYTES) return json({ error: "Requisição muito grande." }, 413, origin);
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) return json({ error: "Requisição muito grande." }, 413, origin);

  let body: { messages?: unknown; context?: { patientId?: unknown } };
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  const history = sanitizeHistory(body.messages);
  if (!history) return json({ error: "Conversa inválida." }, 400, origin);
  const focusId = typeof body.context?.patientId === "string" && UUID_RE.test(body.context.patientId)
    ? body.context.patientId
    : null;

  // 3. Papel na clínica (só equipe clínica; o RLS cuida do resto)
  const { data: member } = await db
    .from("clinic_members")
    .select("clinic_id, role, clinics(name)")
    .eq("user_id", user.id)
    .in("role", ["owner", "nutritionist"])
    .limit(1)
    .maybeSingle();
  if (!member) return json({ error: "Sem permissão para usar os recursos de IA." }, 403, origin);

  // 4. Quota diária (1 por mensagem do usuário)
  const { error: quotaError } = await db.rpc("register_ai_call", { p_daily_limit: AI_DAILY_LIMIT });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    console.error("copilot quota:", code, quotaError.message);
    const status = statusForPgCode(code);
    return json(
      { error: status === 429 ? "Limite diário de uso da IA atingido." : "Sem permissão para usar os recursos de IA." },
      status,
      origin,
    );
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("copilot: GEMINI_API_KEY ausente");
    return json({ error: "Serviço de IA indisponível." }, 502, origin);
  }

  // 5. Contexto do prompt
  const now = nowInSaoPaulo();
  const [{ data: profile }, focusRow] = await Promise.all([
    db.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    focusId
      ? db.from("patients").select("id, name").eq("id", focusId).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const clinic = (Array.isArray(member.clinics) ? member.clinics[0] : member.clinics) as { name?: string } | null;

  const systemInstruction = {
    role: "system",
    parts: [{
      text: buildSystemPrompt({
        today: now.today,
        weekday: now.weekday,
        nowTime: now.time,
        userName: profile?.full_name || "o profissional",
        role: member.role as "owner" | "nutritionist",
        clinicName: clinic?.name || "sua clínica",
        focusPatient: focusRow ? { id: focusRow.id, name: focusRow.name } : null,
      }),
    }],
  };

  const toolCtx: ToolContext = { db, userId: user.id, clinicId: member.clinic_id, today: now.today };
  const contents: GeminiContent[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const tools = [{ functionDeclarations: TOOL_DECLARATIONS }];
  const generationConfig = THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : undefined;

  // Modelo que respondeu na 1ª volta é mantido nas seguintes (assinaturas de
  // pensamento do Gemini 3 são por modelo).
  let modelIdx = 0;
  async function generate(allowTools: boolean): Promise<GeminiPart[]> {
    const payload = {
      contents,
      systemInstruction,
      tools,
      toolConfig: { functionCallingConfig: { mode: allowTools ? "AUTO" : "NONE" } },
      ...(generationConfig ? { generationConfig } : {}),
    };
    for (; modelIdx < MODEL_CHAIN.length; modelIdx++) {
      const model = MODEL_CHAIN[modelIdx];
      const hasNext = modelIdx < MODEL_CHAIN.length - 1;
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
            body: JSON.stringify(payload),
          },
        );
      } catch (err) {
        console.error(`copilot fetch (modelo "${model}"):`, err instanceof Error ? err.message : String(err));
        if (hasNext) continue;
        throw new UpstreamError(502);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (hasNext && isModelUnavailable(res.status, detail)) {
          console.error(`copilot: modelo "${model}" indisponível (${res.status}), tentando "${MODEL_CHAIN[modelIdx + 1]}"`);
          continue;
        }
        console.error(`copilot upstream (modelo "${model}"):`, res.status, detail.slice(0, 500));
        throw new UpstreamError(res.status === 429 ? 429 : 502);
      }
      const data = await res.json();
      const content = data.candidates?.[0]?.content as GeminiContent | undefined;
      const parts = (content?.parts ?? []) as GeminiPart[];
      // Devolve o conteúdo do modelo intacto (inclui thoughtSignature, exigida
      // pelo Gemini 3 para continuar após uma chamada de função).
      if (content) contents.push({ role: "model", parts: content.parts ?? [] });
      return parts;
    }
    throw new UpstreamError(502);
  }

  // 6. Loop de ferramentas
  const steps: string[] = [];
  try {
    for (let round = 0; ; round++) {
      const outOfBudget = round >= MAX_TOOL_ROUNDS || Date.now() - started > SOFT_DEADLINE_MS;
      const parts = await generate(!outOfBudget);
      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);

      if (!calls.length || outOfBudget) {
        const text = parts
          .filter((p) => typeof p.text === "string" && !p.thought)
          .map((p) => p.text)
          .join("")
          .trim();
        console.log(`copilot ok: ${Date.now() - started}ms, rodadas ${round + 1}, ferramentas [${steps.join(", ")}]`);
        if (!text) return json({ error: "O serviço de IA não conseguiu processar a solicitação." }, 502, origin);
        return json({ text, steps: [...new Set(steps.map((s) => STEP_LABELS[s] ?? s))] }, 200, origin);
      }

      const results = await Promise.all(calls.map((c) => runTool(toolCtx, c.name, c.args)));
      steps.push(...calls.map((c) => c.name));
      contents.push({
        role: "user",
        parts: calls.map((c, i) => ({
          functionResponse: { name: c.name, response: results[i], ...(c.id ? { id: c.id } : {}) },
        })),
      });
    }
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 502;
    if (!(err instanceof UpstreamError)) {
      console.error("copilot:", err instanceof Error ? err.message : String(err));
    }
    return json({ error: "O serviço de IA não conseguiu processar a solicitação." }, status, origin);
  }
});
