// supabase/functions/meal-analyze/index.ts
// Análise por IA de um registro do diário de refeições (migration 0036).
// Mesmo fluxo do "Scanner de Refeições" do DoseCerta-AI.
//
// Entrada: { meal_log_id }. O registro já existe (status 'analyzing'), criado
// pelo paciente; a foto (se houver) já está em `meal-photos`.
//   - Tudo é lido/gravado com o JWT do chamador: o RLS só deixa o próprio
//     paciente mexer no registro e baixar a foto.
//   - Cota diária por paciente: register_patient_meal_ai (recusa equipe e
//     paciente com acesso vencido).
//   - Contexto: as opções do plano alimentar para a refeição escolhida.
//   - Resultado: itens + macros do prato inteiro + feedback + aderência ao
//     plano → status 'pending' (o paciente revisa e diz quanto comeu).
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS, GEMINI_MODEL_MEAL_LOG, PATIENT_MEAL_AI_DAILY_LIMIT.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const BASE_ORIGINS = [
  "https://nutri-ai.io",
  "https://www.nutri-ai.io",
  "https://nutri-ai-self-nine.vercel.app",
  "https://dtkoegdmmhnxsrrxmoiq.supabase.co",
  "http://localhost:5173",
  "http://localhost:4173",
];
const EXTRA_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...BASE_ORIGINS, ...EXTRA_ORIGINS];

const DAILY_LIMIT = Number(Deno.env.get("PATIENT_MEAL_AI_DAILY_LIMIT") ?? "20");
const MODEL_CHAIN = [Deno.env.get("GEMINI_MODEL_MEAL_LOG") ?? "gemini-3.6-flash", "gemini-3.5-flash"];
const TIMEOUT_MS = 25_000;

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

function cors(origin: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "Nome do alimento identificado" },
          quantity: { type: "STRING", description: 'Quantidade estimada, ex: "150g", "1 xícara"' },
          calories: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          fat: { type: "NUMBER" },
        },
        required: ["name", "quantity", "calories", "protein", "carbs", "fat"],
      },
    },
    macros: {
      type: "OBJECT",
      properties: { kcal: { type: "NUMBER" }, protein: { type: "NUMBER" }, carbs: { type: "NUMBER" }, fat: { type: "NUMBER" } },
      required: ["kcal", "protein", "carbs", "fat"],
    },
    adherence: { type: "STRING", enum: ["segue_o_plano", "parcial", "fora_do_plano", "sem_plano"] },
    aiFeedback: { type: "STRING", description: "Feedback curto (1-2 frases) cruzando o prato com o plano" },
  },
  required: ["items", "macros", "adherence", "aiFeedback"],
};

type MealOption = { description?: string; items?: string[]; kcal?: number };

const round = (n: unknown) => Math.max(0, Math.round(Number(n) || 0));

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado." }, 401, origin);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401, origin);

  let mealLogId: string;
  try {
    mealLogId = String((await req.json())?.meal_log_id ?? "");
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  if (!/^[0-9a-f-]{36}$/i.test(mealLogId)) return json({ error: "Registro inválido." }, 400, origin);

  const { data: log } = await caller.from("meal_logs")
    .select("id, patient_id, source, photo_path, description, meal_key, status")
    .eq("id", mealLogId).maybeSingle();
  if (!log) return json({ error: "Registro não encontrado." }, 404, origin);
  if (log.status !== "analyzing") return json({ error: "Este registro já foi analisado." }, 409, origin);

  const fail = async (message: string, status: number) => {
    await caller.from("meal_logs").update({ status: "error", analysis_error: message, updated_at: new Date().toISOString() }).eq("id", log.id);
    return json({ error: message }, status, origin);
  };

  // Cota + papel: só o paciente com acesso vigente (equipe é recusada).
  const { error: quotaError } = await caller.rpc("register_patient_meal_ai", { p_daily_limit: DAILY_LIMIT });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    return await fail(quotaError.message || "Sem permissão para usar a IA.", code === "53400" ? 429 : 403);
  }

  // Contexto do plano: as opções planejadas para esta refeição.
  const { data: plan } = await caller.from("meal_plans")
    .select("kcal, meals").eq("patient_id", log.patient_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const mealName = log.meal_key ? MEAL_NAMES[log.meal_key] ?? log.meal_key : null;
  const options: MealOption[] = (plan?.meals && log.meal_key ? (plan.meals as Record<string, MealOption[]>)[log.meal_key] : null) ?? [];
  const planContext = plan
    ? `Plano alimentar do paciente: ${plan.kcal ? `${plan.kcal} kcal/dia` : "meta calórica não informada"}.` +
      (mealName
        ? options.length
          ? ` Opções planejadas para ${mealName}: ${options.map((o, i) => `Opção ${i + 1}: ${o.description ?? ""} (${(o.items ?? []).join("; ")}) ~${o.kcal ?? "?"} kcal`).join(" | ")}.`
          : ` O plano não tem opções para ${mealName}.`
        : " O paciente não informou qual refeição do plano é esta.")
    : "O paciente não tem plano alimentar publicado (use adherence = sem_plano).";

  const instructions =
    "Identifique os alimentos e suas quantidades estimadas, calcule os macronutrientes (proteína, carboidrato, " +
    "gordura em gramas, e calorias) de CADA item individualmente e some-os para obter os totais da refeição. " +
    "Classifique a aderência: segue_o_plano (equivale a uma das opções planejadas), parcial (parecido, com trocas ou " +
    "excessos), fora_do_plano (bem diferente) ou sem_plano. Escreva um feedback curto (1-2 frases, em português, " +
    "tom acolhedor, sem julgamento, pode usar emoji) cruzando o prato com o plano. Nunca faça recomendação médica.\n\n" +
    planContext;

  let parts: unknown[];
  if (log.source === "foto") {
    const { data: blob, error: dlError } = await caller.storage.from("meal-photos").download(log.photo_path);
    if (dlError || !blob) return await fail("Não foi possível ler a foto. Tente de novo.", 502);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    parts = [
      { text: `Analise a foto deste prato de comida${mealName ? ` (${mealName})` : ""}. ${instructions}` },
      { inline_data: { mime_type: blob.type || "image/jpeg", data: encodeBase64(bytes) } },
    ];
  } else {
    parts = [{
      text: `O paciente descreveu em texto o que comeu${mealName ? ` no ${mealName.toLowerCase()}` : ""}. ` +
        "Estime a quantidade quando não for explícita. " + instructions +
        `\n\nDescrição da refeição: "${String(log.description ?? "").trim()}"`,
    }];
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return await fail("Serviço de IA indisponível.", 502);
  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  };

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
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
      clearTimeout(timer);
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      console.error(`meal-analyze fetch (${model}):`, timedOut ? "timeout" : String(err));
      if (i < MODEL_CHAIN.length - 1 && !timedOut) continue;
      return await fail(timedOut ? "A análise demorou demais. Tente de novo." : "Falha ao contatar o serviço de IA.", 504);
    }
    clearTimeout(timer);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`meal-analyze upstream (${model}):`, res.status, detail.slice(0, 300));
      if (i < MODEL_CHAIN.length - 1 && (res.status === 404 || /not[_ ]?found|deprecat/i.test(detail))) continue;
      return await fail("Não foi possível analisar agora. Tente novamente.", res.status === 429 ? 429 : 502);
    }
    const data = await res.json();
    const outParts: Array<{ text?: string; thought?: boolean }> = data.candidates?.[0]?.content?.parts ?? [];
    const text = outParts.find((p) => typeof p.text === "string" && !p.thought)?.text ?? "";
    let parsed: { items?: unknown[]; macros?: Record<string, unknown>; adherence?: string; aiFeedback?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      return await fail("A IA respondeu num formato inesperado. Tente novamente.", 502);
    }
    if (!Array.isArray(parsed.items) || !parsed.macros) {
      return await fail("A IA respondeu num formato inesperado. Tente novamente.", 502);
    }

    const items = (parsed.items as Record<string, unknown>[]).slice(0, 30).map((it) => ({
      name: String(it.name ?? "").slice(0, 120),
      quantity: String(it.quantity ?? "").slice(0, 60),
      calories: round(it.calories),
      protein: round(it.protein),
      carbs: round(it.carbs),
      fat: round(it.fat),
    }));
    // Totais = soma dos itens (fonte única de verdade; a IA às vezes soma errado).
    const base = items.reduce(
      (acc, it) => ({ kcal: acc.kcal + it.calories, protein: acc.protein + it.protein, carbs: acc.carbs + it.carbs, fat: acc.fat + it.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const adherence = ["segue_o_plano", "parcial", "fora_do_plano", "sem_plano"].includes(String(parsed.adherence))
      ? parsed.adherence
      : plan ? "parcial" : "sem_plano";

    const { error: saveError } = await caller.from("meal_logs").update({
      status: "pending",
      analysis_error: null,
      items,
      base_macros: base,
      ai_feedback: String(parsed.aiFeedback ?? "").slice(0, 400),
      adherence,
      updated_at: new Date().toISOString(),
    }).eq("id", log.id);
    if (saveError) {
      console.error("meal-analyze save:", saveError.message);
      return json({ error: "Não foi possível salvar a análise." }, 500, origin);
    }
    console.log(`meal-analyze ok: ${log.source}, modelo ${model}, ${items.length} itens`);
    return json({ ok: true }, 200, origin);
  }
  return await fail("Não foi possível analisar agora. Tente novamente.", 502);
});
