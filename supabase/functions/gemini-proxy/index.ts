// supabase/functions/gemini-proxy/index.ts
// Proxy seguro para a API do Google Gemini (laudos de exame, planos alimentares e prontuário SOAP).
// A GEMINI_API_KEY fica como secret do servidor e nunca chega ao cliente.
//
// Hardening (SEC-10):
//   - CORS estrito: origem fora da allowlist => 403 (sem fallback).
//   - Status HTTP reais (400/401/403/413/429/502), sem vazar corpo de erro do
//     Gemini nem err.message para o cliente.
//   - Limite de tamanho do corpo (exames vêm como PDF/imagem base64 inline).
//   - Quota diária por usuário via RPC register_ai_call (com o JWT do chamador);
//     a RPC também exige que o chamador seja equipe clínica ativa
//     (owner/nutritionist) — fecha o abuso por paciente/secretária.
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS (csv, adiciona domínios), AI_DAILY_LIMIT (int),
//            GEMINI_MODEL_EXAM / GEMINI_MODEL_MEAL / GEMINI_MODEL_SOAP
//            (sobrescrevem o modelo primário de cada tarefa).
//
// Modelo por tarefa: o cliente manda só `task` ("exam" | "meal_plan" | "soap");
// o nome do modelo é decidido aqui, no servidor — o cliente nunca escolhe
// modelo (senão poderia forçar o mais caro). Laudo de exame (PDF clínico) usa
// o Flash mais forte; SOAP (só reorganiza texto) usa o Flash-Lite.
//
// Resiliência (fallback de modelo):
//   - Cada tarefa tem uma cadeia de modelos. Se um responder 404/"not found"/
//     "deprecated" ou falhar de rede, o proxy tenta o próximo da cadeia, sem
//     expor o erro ao front-end. Isso evita que uma descontinuação de modelo
//     pelo Google derrube o app em produção.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const MAX_BODY_BYTES = 15 * 1024 * 1024; // 15 MB
const AI_DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "50");

type Task = "exam" | "meal_plan" | "soap";

// Cadeia de modelos por tarefa: [primário, ...fallbacks]. O primário pode ser
// trocado por env sem redeploy; os fallbacks são modelos estáveis atuais.
const MODEL_CHAINS: Record<Task, string[]> = {
  exam: [Deno.env.get("GEMINI_MODEL_EXAM") ?? "gemini-3.7-flash", "gemini-3.6-flash"],
  meal_plan: [Deno.env.get("GEMINI_MODEL_MEAL") ?? "gemini-3.6-flash", "gemini-3.5-flash"],
  soap: [Deno.env.get("GEMINI_MODEL_SOAP") ?? "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
};

function isTask(v: unknown): v is Task {
  return typeof v === "string" && Object.hasOwn(MODEL_CHAINS, v);
}

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
  if (code === "53400") return 429; // limite diário
  if (code === "42501") return 403; // sem permissão
  if (code === "28000") return 401; // não autenticado
  return 403;
}

function callGeminiModel(
  model: string,
  apiKey: string,
  payload: unknown,
): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
    },
  );
}

// Detecta respostas de erro que indicam que o MODELO em si está indisponível
// (removido/descontinuado/nome inválido) — caso em que vale tentar o fallback.
// Outros erros (400 de payload malformado, 429 de quota, 5xx transiente) não
// são causados pelo nome do modelo, então não acionam o fallback.
function isModelUnavailable(status: number, detail: string): boolean {
  if (status === 404) return true;
  return /not[_ ]?found|deprecat|no longer (available|supported)|has been removed|unsupported model|unknown model/i
    .test(detail);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: baseCors(origin) });
  }
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origem não permitida." }, 403, origin);
  }
  if (req.method !== "POST") {
    return json({ error: "Método não suportado." }, 405, origin);
  }

  // 1. Autenticação do chamador
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Token de autenticação ausente." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const caller = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Usuário não autenticado." }, 401, origin);

  // 2. Limite de tamanho do corpo
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (declaredLen > MAX_BODY_BYTES) {
    return json({ error: "Requisição muito grande." }, 413, origin);
  }
  const raw = await req.arrayBuffer();
  if (raw.byteLength > MAX_BODY_BYTES) {
    return json({ error: "Requisição muito grande." }, 413, origin);
  }

  let body: { task?: unknown; contents?: unknown; systemInstruction?: unknown; generationConfig?: unknown };
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  const { task, contents, systemInstruction, generationConfig } = body;
  if (!isTask(task)) {
    return json({ error: "O campo 'task' é inválido." }, 400, origin);
  }
  if (!Array.isArray(contents) || contents.length === 0) {
    return json({ error: "O campo 'contents' é obrigatório." }, 400, origin);
  }

  // 3. Quota diária + autorização de papel (via RPC com o JWT do chamador)
  const { error: quotaError } = await caller.rpc("register_ai_call", {
    p_daily_limit: AI_DAILY_LIMIT,
  });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    console.error("gemini-proxy quota:", code, quotaError.message);
    const status = statusForPgCode(code);
    return json(
      { error: status === 429 ? "Limite diário de uso da IA atingido." : "Sem permissão para usar a IA." },
      status,
      origin,
    );
  }

  // 4. Chamada ao Gemini (com fallback automático de modelo)
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    console.error("gemini-proxy: GEMINI_API_KEY ausente");
    return json({ error: "Serviço de IA indisponível." }, 502, origin);
  }

  const geminiPayload = { contents, systemInstruction, generationConfig };
  // Dedup: se o env apontar o primário para o mesmo modelo do fallback.
  const chain = [...new Set(MODEL_CHAINS[task])];

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const hasNext = i < chain.length - 1;

    let geminiResponse: Response;
    try {
      geminiResponse = await callGeminiModel(model, geminiApiKey, geminiPayload);
    } catch (err) {
      console.error(
        `gemini-proxy fetch (task "${task}", modelo "${model}"):`,
        err instanceof Error ? err.message : String(err),
      );
      if (hasNext) continue;
      return json({ error: "Falha ao contatar o serviço de IA." }, 502, origin);
    }

    if (!geminiResponse.ok) {
      const detail = await geminiResponse.text().catch(() => "");
      if (hasNext && isModelUnavailable(geminiResponse.status, detail)) {
        console.error(
          `gemini-proxy: modelo "${model}" indisponível (${geminiResponse.status}) para task "${task}", ` +
            `tentando "${chain[i + 1]}"`,
        );
        continue;
      }
      console.error(`gemini-proxy upstream (task "${task}", modelo "${model}"):`, geminiResponse.status, detail.slice(0, 500));
      const status = geminiResponse.status === 429 ? 429 : 502;
      return json({ error: "O serviço de IA não conseguiu processar a solicitação." }, status, origin);
    }

    const geminiData = await geminiResponse.json();
    // Gemini 3 pode devolver partes de "pensamento" antes da resposta: pega a
    // primeira parte de texto que não seja thought.
    const parts: Array<{ text?: string; thought?: boolean }> =
      geminiData.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => typeof p.text === "string" && !p.thought)?.text ?? null;
    console.log(`gemini-proxy ok: task "${task}", modelo "${model}"`);
    return json({ text }, 200, origin);
  }

  return json({ error: "O serviço de IA não conseguiu processar a solicitação." }, 502, origin);
});
