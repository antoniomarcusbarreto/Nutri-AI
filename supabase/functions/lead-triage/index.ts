// supabase/functions/lead-triage/index.ts
// Triagem por IA de um pedido do formulário público (migration 0042).
//
// Só o NUTRICIONISTA dono do link dispara: a função usa o JWT do chamador para
// ler o lead (o RLS só entrega ao dono) e passa pela quota `register_ai_call`,
// que recusa pacientes e secretárias.
//
// Entrada: { lead_id }. Saída: { triage }, também gravada em `leads.ai_triage`.
//
// Quem decide se a pessoa já é paciente é o banco (lead_patient_match,
// comparação exata por WhatsApp/e-mail/nome + nascimento). A IA recebe esse
// resultado e o histórico, e só organiza: resumo, prioridade, pontos de
// atenção, serviço sugerido, perguntas para a consulta e a mensagem de
// WhatsApp. Não diagnostica.
//
// Secrets: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY.
// Opcionais: ALLOWED_ORIGINS, AI_DAILY_LIMIT, GEMINI_MODEL_TRIAGE.

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

const AI_DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "50");
const MODEL_CHAIN = [...new Set([Deno.env.get("GEMINI_MODEL_TRIAGE") ?? "gemini-3.6-flash", "gemini-3.5-flash"])];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const GOAL: Record<string, string> = {
  emagrecimento: "emagrecimento",
  ganho_massa: "ganho de massa muscular",
  saude: "saúde / exames alterados",
  gestacao: "gestação ou amamentação",
  esporte: "performance esportiva",
  comportamento: "relação com a comida",
  outro: "outro",
};
const CONDITION: Record<string, string> = {
  diabetes: "diabetes",
  hipertensao: "pressão alta",
  colesterol: "colesterol/triglicerídeos",
  tireoide: "tireoide",
  sop: "SOP",
  renal: "doença renal",
  gastro: "gastrite/refluxo/intestino",
  outra: "outra condição",
};
const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    resumo: { type: "STRING" },
    prioridade: { type: "STRING", enum: ["alta", "media", "baixa"] },
    prioridade_motivo: { type: "STRING" },
    pontos_atencao: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING" },
          detalhe: { type: "STRING" },
          tipo: { type: "STRING", enum: ["cuidado", "encaminhamento", "info"] },
        },
        required: ["titulo", "detalhe", "tipo"],
      },
    },
    servico_sugerido_id: { type: "STRING", nullable: true },
    servico_motivo: { type: "STRING", nullable: true },
    perguntas_consulta: { type: "ARRAY", items: { type: "STRING" } },
    mensagem_whatsapp: { type: "STRING" },
  },
  required: ["resumo", "prioridade", "prioridade_motivo", "pontos_atencao", "perguntas_consulta", "mensagem_whatsapp"],
};

const SYSTEM = `Você faz a TRIAGEM ADMINISTRATIVA de pedidos de atendimento que chegam a um(a) nutricionista por um formulário público.
Você organiza a informação para o(a) nutricionista decidir; você NÃO diagnostica, NÃO prescreve e NÃO fala com o paciente.

Tarefas:
1. resumo: 2 ou 3 frases objetivas sobre quem é a pessoa e o que busca.
2. prioridade + prioridade_motivo (1 frase):
   - alta: condição de saúde que pede acompanhamento próximo (gestação, diabetes com insulina, doença renal, sinais de transtorno alimentar, menor de idade com objetivo de peso) ou prazo curto declarado;
   - media: objetivo de saúde com alguma condição controlada, ou paciente antigo voltando;
   - baixa: objetivo estético/geral sem condições relatadas.
3. pontos_atencao: só o que for relevante para o atendimento. tipo:
   - "encaminhamento": situações em que o(a) nutricionista deve considerar trabalho conjunto com médico/psicólogo (ex.: suspeita de transtorno alimentar, doença renal, gestação de risco, uso de insulina, bariátrica, menor de idade);
   - "cuidado": algo a investigar na consulta (medicamentos que interferem no apetite/peso, alergias, restrições, IMC muito baixo ou muito alto calculado com peso/altura informados);
   - "info": dado útil de contexto (já é paciente, já fez acompanhamento, prazo/evento).
   Escreva como observação para um colega profissional, sem alarmismo e sem afirmar diagnóstico ("relata", "informa", "vale confirmar").
   Lista vazia se não houver nada.
4. servico_sugerido_id: o id de UM dos serviços da lista que melhor se encaixa (ex.: primeira consulta para paciente novo, retorno para paciente antigo, online se a pessoa prefere online). null se nenhum servir. servico_motivo: 1 frase curta.
5. perguntas_consulta: 3 a 5 perguntas para aprofundar na primeira conversa/anamnese.
6. mensagem_whatsapp: primeira mensagem do(a) nutricionista para a pessoa, em português do Brasil, cordial e curta (até 4 frases), chamando pelo primeiro nome, citando o objetivo, sem dados de saúde sensíveis e sem prometer resultado. Se já é paciente, trate como retorno. Termine convidando a combinar o melhor horário. Não invente preço nem horários. Assine com o primeiro nome do(a) nutricionista.

Responda só o JSON pedido.`;

type Lead = Record<string, unknown> & {
  id: string;
  clinic_id: string;
  name: string;
  matched_patient_id: string | null;
};

const ageFrom = (birth: string | null) => {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00Z`);
  const n = new Date();
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--;
  return a;
};

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

  let leadId: string;
  try {
    leadId = String((await req.json())?.lead_id ?? "");
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  if (!UUID_RE.test(leadId)) return json({ error: "Pedido inválido." }, 400, origin);

  // RLS: só o nutricionista dono do link lê o lead.
  const { data: lead } = await caller.from("leads")
    .select("*, matched_patient_id:lead_patient_match")
    .eq("id", leadId).maybeSingle<Lead>();
  if (!lead) return json({ error: "Pedido não encontrado." }, 404, origin);

  const { error: quotaError } = await caller.rpc("register_ai_call", { p_daily_limit: AI_DAILY_LIMIT });
  if (quotaError) {
    const code = (quotaError as { code?: string }).code;
    const status = code === "53400" ? 429 : 403;
    return json({ error: status === 429 ? "Limite diário de uso da IA atingido." : "Sem permissão para usar a IA." }, status, origin);
  }

  const [{ data: services }, { data: profile }] = await Promise.all([
    caller.from("services").select("id, name, modality, duration_minutes").eq("clinic_id", lead.clinic_id).order("name"),
    caller.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  // Histórico do paciente, quando o banco achou correspondência.
  let history = "Não encontrado entre os pacientes do(a) nutricionista: é um paciente NOVO.";
  if (lead.matched_patient_id) {
    const nowIso = new Date().toISOString();
    const [{ data: patient }, { data: appts }] = await Promise.all([
      caller.from("patients").select("name, status, created_at, main_goal").eq("id", lead.matched_patient_id).maybeSingle(),
      caller.from("appointments").select("date_time, status").eq("patient_id", lead.matched_patient_id)
        .order("date_time", { ascending: false }).limit(50),
    ]);
    const done = (appts ?? []).filter((a) => a.status === "concluido");
    const next = (appts ?? []).filter((a) => a.date_time >= nowIso && !["cancelado", "nao_compareceu"].includes(a.status))
      .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];
    history = patient
      ? `JÁ É PACIENTE (cadastro "${patient.name}", desde ${String(patient.created_at).slice(0, 10)}, status ${patient.status}` +
        `${patient.main_goal ? `, objetivo anterior: ${patient.main_goal}` : ""}). ` +
        `Consultas concluídas: ${done.length}${done[0] ? `, a última em ${done[0].date_time.slice(0, 10)}` : ""}. ` +
        (next ? `Já tem consulta marcada em ${next.date_time.slice(0, 10)}.` : "Sem consulta futura marcada.")
      : "JÁ É PACIENTE (detalhes do cadastro indisponíveis).";
  }

  const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const age = ageFrom(s(lead.birth_date));
  const weight = Number(lead.weight_kg) || null;
  const height = Number(lead.height_cm) || null;
  const bmi = weight && height ? (weight / ((height / 100) ** 2)).toFixed(1) : null;
  const conditions = ((lead.conditions as string[]) ?? []).map((c) => CONDITION[c] ?? c);
  const pregnancy = lead.pregnancy === "gestante" ? "gestante" : lead.pregnancy === "amamentando" ? "amamentando" : null;

  const lines = [
    `Nome: ${lead.name}`,
    `Idade: ${age ?? "não informada"}${lead.biological_sex ? `; sexo ${lead.biological_sex === "F" ? "feminino" : "masculino"}` : ""}`,
    `Atendimento preferido: ${s(lead.modality) ?? "não informado"}${lead.city ? `; cidade ${lead.city}` : ""}`,
    `Objetivo: ${GOAL[String(lead.goal)] ?? lead.goal}`,
    `Nas palavras da pessoa: ${s(lead.goal_details) ?? "(não escreveu)"}`,
    `Prazo/evento: ${s(lead.deadline) ?? "não informado"}`,
    `Já fez acompanhamento nutricional: ${lead.had_nutritionist === true ? "sim" : lead.had_nutritionist === false ? "não" : "não informado"}`,
    `Condições diagnosticadas: ${conditions.length ? conditions.join(", ") : "nenhuma marcada"}`,
    `Medicamentos contínuos: ${s(lead.medications) ?? "não informado"}`,
    `Gestação/amamentação: ${pregnancy ?? "não"}`,
    `Alergias/intolerâncias: ${s(lead.allergies) ?? "não informado"}`,
    `Restrições alimentares: ${s(lead.restrictions) ?? "não informado"}`,
    `Peso/altura informados: ${weight ? `${weight} kg` : "?"} / ${height ? `${height} cm` : "?"}${bmi ? ` (IMC calculado ${bmi})` : ""}`,
    `Algo mais sobre a saúde: ${s(lead.health_notes) ?? "(nada)"}`,
    `Disponibilidade: ${((lead.preferred_days as number[]) ?? []).map((d) => DAYS[d]).join(", ") || "qualquer dia"}; ${((lead.preferred_periods as string[]) ?? []).join(", ") || "qualquer período"}`,
    `Cadastro: ${history}`,
  ];
  const servicesText = (services ?? []).length
    ? (services ?? []).map((sv) => `- id ${sv.id}: ${sv.name} (${sv.modality}, ${sv.duration_minutes} min)`).join("\n")
    : "(nenhum serviço cadastrado: use null)";
  const firstName = String(profile?.full_name ?? "").trim().split(/\s+/)[0] || "";

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Serviço de IA indisponível." }, 502, origin);

  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{
      role: "user",
      parts: [{
        text: `Nutricionista: ${firstName || "(sem nome)"}\n\nPedido recebido:\n${lines.join("\n")}\n\nServiços da clínica:\n${servicesText}`,
      }],
    }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
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
      console.error(`lead-triage fetch (${model}):`, err instanceof Error ? err.message : String(err));
      if (i < MODEL_CHAIN.length - 1) continue;
      return json({ error: "Falha ao contatar o serviço de IA." }, 502, origin);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`lead-triage upstream (${model}):`, res.status, detail.slice(0, 300));
      if (i < MODEL_CHAIN.length - 1 && (res.status === 404 || /not[_ ]?found|deprecat/i.test(detail))) continue;
      return json({ error: "O serviço de IA não conseguiu fazer a triagem." }, res.status === 429 ? 429 : 502, origin);
    }
    const data = await res.json();
    const partsOut: Array<{ text?: string; thought?: boolean }> = data.candidates?.[0]?.content?.parts ?? [];
    const text = partsOut.find((p) => typeof p.text === "string" && !p.thought)?.text ?? "";
    let triage: Record<string, unknown>;
    try {
      triage = JSON.parse(text);
    } catch {
      return json({ error: "A IA devolveu uma resposta inválida. Tente de novo." }, 502, origin);
    }
    // Serviço sugerido precisa ser um dos da clínica.
    if (!(services ?? []).some((sv) => sv.id === triage.servico_sugerido_id)) {
      triage.servico_sugerido_id = null;
      triage.servico_motivo = null;
    }
    triage.model = model;

    const { error: saveError } = await caller.from("leads")
      .update({ ai_triage: triage, ai_triaged_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (saveError) console.error("lead-triage save:", saveError.message);

    return json({ triage }, 200, origin);
  }
  return json({ error: "O serviço de IA não conseguiu fazer a triagem." }, 502, origin);
});
