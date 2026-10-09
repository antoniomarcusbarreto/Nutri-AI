// supabase/functions/body-assessment-ai/index.ts
// Análise por IA das fotos de uma avaliação corporal (migration 0034).
//
// Só o NUTRICIONISTA dispara: a função usa o JWT do chamador para ler a
// avaliação (o RLS só entrega a quem tem acesso clínico ao paciente) e passa
// pela quota `register_ai_call`, que recusa pacientes e secretárias.
//
// Entrada: { assessment_id }. Saída: a estimativa, que também é gravada em
// `body_assessments.ai_estimate` (o paciente nunca lê esse campo).
//
// A IA ESTIMA perímetros e % de gordura a partir das fotos, usando a altura
// informada como escala, e compara com a avaliação anterior (se houver fotos).
// É estimativa sem poder diagnóstico: o nutricionista valida antes de usar.
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS, AI_DAILY_LIMIT, GEMINI_MODEL_BODY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

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

const AI_DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "50");
const MODEL_CHAIN = [Deno.env.get("GEMINI_MODEL_BODY") ?? "gemini-3.7-flash", "gemini-3.6-flash"];
const POSES = ["front", "side", "back"] as const;
const POSE_LABEL: Record<(typeof POSES)[number], string> = { front: "frente", side: "lado", back: "costas" };

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

type Assessment = {
  id: string;
  patient_id: string;
  status: string;
  kind: string;
  created_at: string;
  assessed_at: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  arm_cm: number | null;
  forearm_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;
  body_fat_pct: number | null;
  photo_paths: Partial<Record<(typeof POSES)[number], string>>;
};

const FIELDS = "id, patient_id, status, kind, created_at, assessed_at, height_cm, weight_kg, arm_cm, forearm_cm, waist_cm, hip_cm, thigh_cm, calf_cm, body_fat_pct, photo_paths";

async function photoParts(client: SupabaseClient, a: Assessment, label: string) {
  const parts: unknown[] = [];
  for (const pose of POSES) {
    const path = a.photo_paths?.[pose];
    if (!path) continue;
    const { data, error } = await client.storage.from("body-photos").download(path);
    if (error || !data) throw new Error(`foto ${pose} indisponível`);
    const bytes = new Uint8Array(await data.arrayBuffer());
    parts.push({ text: `${label} — foto de ${POSE_LABEL[pose]}:` });
    parts.push({ inline_data: { mime_type: data.type || "image/jpeg", data: encodeBase64(bytes) } });
  }
  return parts;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    photo_quality_ok: { type: "BOOLEAN" },
    photo_issues: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["baixa", "media", "alta"] },
    estimated: {
      type: "OBJECT",
      properties: {
        arm_cm: { type: "NUMBER", nullable: true },
        forearm_cm: { type: "NUMBER", nullable: true },
        waist_cm: { type: "NUMBER", nullable: true },
        hip_cm: { type: "NUMBER", nullable: true },
        thigh_cm: { type: "NUMBER", nullable: true },
        calf_cm: { type: "NUMBER", nullable: true },
        body_fat_pct: { type: "NUMBER", nullable: true },
      },
    },
    body_shape: { type: "STRING", nullable: true },
    comparison: { type: "STRING", nullable: true },
    observations: { type: "STRING" },
  },
  required: ["photo_quality_ok", "photo_issues", "confidence", "estimated", "observations"],
};

const SYSTEM = `Você apoia nutricionistas na avaliação corporal por fotos (sem poder diagnóstico).
Receberá fotos de frente, lado e costas de um paciente adulto, com altura e peso informados (use a altura como escala).
Tarefas:
1. Avalie a qualidade das fotos (pose, enquadramento de corpo inteiro, roupa justa, luz, câmera na altura do quadril). Liste problemas objetivos em português.
2. Estime os perímetros em cm: braço (ponto médio do braço relaxado), antebraço (maior circunferência), cintura (ponto médio entre última costela e crista ilíaca), quadril (maior protuberância glútea), coxa (ponto médio) e panturrilha (maior circunferência). Se uma medida não for estimável, use null.
3. Estime o percentual de gordura corporal.
4. Descreva o formato corporal predominante em poucas palavras (ex.: "androide", "ginoide", "bicônico").
5. Se houver fotos de uma avaliação anterior, descreva de forma objetiva o que mudou (regiões, contorno, postura). Sem anterior, comparison = null.
6. observations: 2 a 4 frases objetivas para o nutricionista.
Regras: nunca comente aparência de forma estética ou julgadora; seja factual e clínico; indique confiança baixa quando as fotos forem ruins. Responda só o JSON pedido.`;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Token de autenticação ausente." }, 401, origin);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Usuário não autenticado." }, 401, origin);

  let assessmentId: string;
  try {
    assessmentId = String((await req.json())?.assessment_id ?? "");
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  if (!/^[0-9a-f-]{36}$/i.test(assessmentId)) return json({ error: "Avaliação inválida." }, 400, origin);

  // RLS: só quem tem acesso clínico ao paciente lê a avaliação (paciente não).
  const { data: current } = await caller.from("body_assessments").select(FIELDS).eq("id", assessmentId).maybeSingle<Assessment>();
  if (!current) return json({ error: "Avaliação não encontrada." }, 404, origin);
  if (!POSES.every((p) => current.photo_paths?.[p])) {
    return json({ error: "Esta avaliação não tem as três fotos." }, 400, origin);
  }

  // Quota + papel (recusa paciente e secretária).
  const { error: quotaError } = await caller.rpc("register_ai_call", { p_daily_limit: AI_DAILY_LIMIT });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    const status = code === "53400" ? 429 : 403;
    return json({ error: status === 429 ? "Limite diário de uso da IA atingido." : "Sem permissão para usar a IA." }, status, origin);
  }

  // Avaliação anterior com fotos, para comparar a evolução.
  const { data: previousList } = await caller.from("body_assessments").select(FIELDS)
    .eq("patient_id", current.patient_id).neq("id", current.id)
    .in("status", ["enviada", "validada"])
    .lt("created_at", current.created_at)
    .order("created_at", { ascending: false }).limit(5);
  const previous = ((previousList ?? []) as Assessment[]).find((a) => POSES.every((p) => a.photo_paths?.[p]));

  const { data: patient } = await caller.from("patients").select("biological_sex, birth_date").eq("id", current.patient_id).maybeSingle();
  const age = patient?.birth_date
    ? Math.floor((Date.now() - new Date(patient.birth_date).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const sex = patient?.biological_sex === "M" ? "masculino" : patient?.biological_sex === "F" ? "feminino" : "não informado";

  let parts: unknown[];
  try {
    parts = [
      {
        text: `Paciente: sexo ${sex}${age ? `, ${age} anos` : ""}, altura ${current.height_cm ?? "?"} cm, peso ${current.weight_kg ?? "?"} kg.` +
          (current.waist_cm ? ` Medidas com fita informadas pelo paciente (podem ter erro): cintura ${current.waist_cm} cm, quadril ${current.hip_cm ?? "?"} cm.` : ""),
      },
      ...(await photoParts(caller, current, "Avaliação atual")),
    ];
    if (previous) {
      parts.push({
        text: `Avaliação anterior (${(previous.assessed_at ?? previous.created_at).slice(0, 10)}): peso ${previous.weight_kg ?? "?"} kg, cintura ${previous.waist_cm ?? "?"} cm, quadril ${previous.hip_cm ?? "?"} cm, gordura ${previous.body_fat_pct ?? "?"}%.`,
      });
      parts.push(...(await photoParts(caller, previous, "Avaliação anterior")));
    }
  } catch (err) {
    console.error("body-assessment-ai fotos:", err instanceof Error ? err.message : String(err));
    return json({ error: "Não foi possível ler as fotos da avaliação." }, 502, origin);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Serviço de IA indisponível." }, 502, origin);

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
  };

  for (let i = 0; i < MODEL_CHAIN.length; i++) {
    const model = MODEL_CHAIN[i];
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error(`body-assessment-ai fetch (${model}):`, err instanceof Error ? err.message : String(err));
      if (i < MODEL_CHAIN.length - 1) continue;
      return json({ error: "Falha ao contatar o serviço de IA." }, 502, origin);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`body-assessment-ai upstream (${model}):`, res.status, detail.slice(0, 300));
      if (i < MODEL_CHAIN.length - 1 && (res.status === 404 || /not[_ ]?found|deprecat/i.test(detail))) continue;
      return json({ error: "O serviço de IA não conseguiu analisar as fotos." }, res.status === 429 ? 429 : 502, origin);
    }
    const data = await res.json();
    const partsOut: Array<{ text?: string; thought?: boolean }> = data.candidates?.[0]?.content?.parts ?? [];
    const text = partsOut.find((p) => typeof p.text === "string" && !p.thought)?.text ?? "";
    let estimate: Record<string, unknown>;
    try {
      estimate = JSON.parse(text);
    } catch {
      return json({ error: "A IA devolveu uma resposta inválida. Tente de novo." }, 502, origin);
    }
    estimate.model = model;
    estimate.compared_with = previous?.id ?? null;

    const { error: saveError } = await caller.from("body_assessments")
      .update({ ai_estimate: estimate, ai_analyzed_at: new Date().toISOString() })
      .eq("id", current.id);
    if (saveError) console.error("body-assessment-ai save:", saveError.message);

    return json({ estimate }, 200, origin);
  }
  return json({ error: "O serviço de IA não conseguiu analisar as fotos." }, 502, origin);
});
