// supabase/functions/schedule-notify/index.ts
// Avisos por e-mail dos pedidos de agenda do portal (migrations 0032/0035).
//
// O app chama depois de criar ou responder um pedido: { request_id }.
//   - Autorização: o pedido é lido com o JWT do chamador — o RLS só entrega ao
//     próprio paciente ou à equipe que enxerga a consulta. Sem leitura, 403.
//   - O evento sai do estado atual do pedido (não do que o cliente disser):
//       pendente               → nutricionista ("pediu consulta/remarcação/cancelou")
//       proposto               → paciente ("a clínica sugeriu outra data")
//       aceito / recusado      → paciente, ou nutricionista quando foi o
//                                paciente que respondeu a uma sugestão
//   - Idempotente: cada evento enviado fica em appointment_change_requests.notified.
//   - Falha de e-mail não quebra nada: o pedido já foi gravado.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
const APP_URL = "https://nutri-ai.io";

const REMETENTE = "Nutri-AI <suporte@notificacoes.codehatch.com.br>";
const RESPONDER_PARA = "suporte@codehatch.com.br";

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

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fmtWhen = (iso: string | null) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
};

function emailHtml(title: string, lines: string[], cta: { label: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0f172a;padding:24px 32px;"><span style="font-size:22px;font-weight:800;color:#ffffff;">Nutri<span style="color:#14b8a6;">-AI</span></span></td></tr>
<tr><td style="padding:32px;">
<p style="margin:0 0 16px;font-size:18px;font-weight:600;color:#0f172a;">${escapeHtml(title)}</p>
${lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#475569;">${escapeHtml(l)}</p>`).join("")}
<p style="margin:24px 0 0;"><a href="${cta.url}" style="display:inline-block;background:#5024fc;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:12px;">${escapeHtml(cta.label)}</a></p>
</td></tr>
<tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;color:#94a3b8;">Você recebeu este aviso porque usa a agenda online do Nutri-AI.</p></td></tr>
</table></td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")!}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REMETENTE, to, reply_to: RESPONDER_PARA, subject, html, text }),
  });
  if (!res.ok) console.error("[schedule-notify] Resend", res.status, await res.text());
  return res.ok;
}

type Req = {
  id: string; kind: "reschedule" | "booking" | "cancel"; status: string;
  appointment_id: string | null; patient_id: string; nutritionist_id: string | null;
  requested_at: string | null; proposed_at: string | null; response_note: string | null; note: string | null;
  handled_by: string | null; duration_minutes: number | null; notified: Record<string, string>;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: "Origem não permitida." }, 403, origin);
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, origin);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Não autenticado." }, 401, origin);
  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "Não autenticado." }, 401, origin);

  let body: { request_id?: string; mine_latest?: boolean };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // As RPCs do paciente não devolvem o id do pedido: `mine_latest` pega o
  // pedido mais recente dele (últimos 2 minutos). Só vale para paciente.
  let requestId = String(body.request_id ?? "");
  if (!requestId && body.mine_latest) {
    const { data: me } = await admin.from("patients").select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (!me) return json({ error: "Pedido não encontrado." }, 403, origin);
    const { data: latest } = await caller.from("appointment_change_requests").select("id")
      .eq("patient_id", me.id)
      .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    requestId = latest?.id ?? "";
  }
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ ok: true, skipped: "sem pedido" }, 200, origin);

  // RLS do chamador: paciente dono ou equipe que enxerga a consulta.
  const { data: visible } = await caller.from("appointment_change_requests").select("id").eq("id", requestId).maybeSingle();
  if (!visible) return json({ error: "Pedido não encontrado." }, 403, origin);

  const { data: r } = await admin.from("appointment_change_requests")
    .select("id, kind, status, appointment_id, patient_id, nutritionist_id, requested_at, proposed_at, response_note, note, handled_by, duration_minutes, notified")
    .eq("id", requestId).maybeSingle<Req>();
  if (!r) return json({ error: "Pedido não encontrado." }, 404, origin);

  const [{ data: patient }, { data: nutri }, { data: appt }] = await Promise.all([
    admin.from("patients").select("name, email, user_id").eq("id", r.patient_id).maybeSingle(),
    r.nutritionist_id ? admin.from("profiles").select("full_name").eq("id", r.nutritionist_id).maybeSingle() : Promise.resolve({ data: null }),
    r.appointment_id ? admin.from("appointments").select("date_time").eq("id", r.appointment_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const patientName = patient?.name ?? "Paciente";
  const firstName = patientName.split(" ")[0];
  const nutriName = nutri?.full_name ?? "Seu nutricionista";
  const answeredByPatient = !!r.handled_by && r.handled_by === patient?.user_id;
  const when = fmtWhen(r.status === "proposto" ? r.proposed_at : r.requested_at);
  const what = r.kind === "booking" ? "consulta" : "remarcação";

  let event: string | null = null;
  let to: "nutri" | "patient" | null = null;
  if (r.status === "pendente") { event = "created"; to = "nutri"; }
  else if (r.status === "proposto") { event = `proposed:${r.proposed_at}`; to = "patient"; }
  else if (r.status === "aceito" && r.kind !== "cancel") { event = answeredByPatient ? "patient_accepted" : "accepted"; to = answeredByPatient ? "nutri" : "patient"; }
  else if (r.status === "recusado") { event = answeredByPatient ? "patient_declined" : "declined"; to = answeredByPatient ? "nutri" : "patient"; }
  if (!event || !to) return json({ ok: true, skipped: "sem aviso para este estado" }, 200, origin);
  if (r.notified?.[event]) return json({ ok: true, skipped: "já avisado" }, 200, origin);

  let email: string | null = null;
  if (to === "nutri" && r.nutritionist_id) {
    const { data } = await admin.auth.admin.getUserById(r.nutritionist_id);
    email = data.user?.email ?? null;
  } else if (to === "patient") {
    email = patient?.email ?? null;
  }
  if (!email) return json({ ok: true, skipped: "sem e-mail" }, 200, origin);

  const staffLink = { label: "Abrir a agenda", url: `${APP_URL}/agenda` };
  const patientLink = { label: "Abrir minhas consultas", url: `${APP_URL}/portal/agenda` };
  let subject = "";
  let title = "";
  let lines: string[] = [];
  let cta = staffLink;

  if (event === "created") {
    if (r.kind === "cancel") {
      subject = `${patientName} cancelou a consulta`;
      title = `${patientName} cancelou a consulta`;
      lines = [`Consulta de ${fmtWhen(appt?.date_time ?? null)}.`, ...(r.note ? [`Motivo: "${r.note}"`] : [])];
    } else {
      subject = `Novo pedido de ${what}: ${patientName}`;
      title = `${patientName} pediu ${r.kind === "booking" ? "uma consulta" : "para remarcar"}`;
      lines = [
        `Horário escolhido: ${when}${r.duration_minutes ? ` (${r.duration_minutes} min)` : ""}.`,
        ...(r.kind === "reschedule" && appt?.date_time ? [`Consulta atual: ${fmtWhen(appt.date_time)}.`] : []),
        ...(r.note ? [`Observação: "${r.note}"`] : []),
        "Aceite, recuse ou sugira outra data pela Agenda.",
      ];
    }
  } else if (event.startsWith("proposed")) {
    cta = patientLink;
    subject = "Sua clínica sugeriu outra data";
    title = `Olá, ${firstName}! ${nutriName} sugeriu outra data`;
    lines = [`Nova data: ${when}.`, ...(r.response_note ? [`"${r.response_note}"`] : []), "Abra o app para aceitar ou recusar."];
  } else if (event === "accepted") {
    cta = patientLink;
    subject = "Consulta confirmada";
    title = `Olá, ${firstName}! Sua consulta está confirmada`;
    lines = [`${fmtWhen(r.requested_at)} com ${nutriName}.`];
  } else if (event === "declined") {
    cta = patientLink;
    subject = `Não foi possível atender seu pedido de ${what}`;
    title = `Olá, ${firstName}. A clínica não conseguiu atender seu pedido`;
    lines = ["Você pode escolher outro horário pelo app ou falar com a clínica."];
  } else if (event === "patient_accepted") {
    subject = `${patientName} aceitou a data sugerida`;
    title = `${patientName} aceitou a data sugerida`;
    lines = [`Consulta confirmada para ${fmtWhen(r.proposed_at)}.`];
  } else if (event === "patient_declined") {
    subject = `${patientName} recusou a data sugerida`;
    title = `${patientName} não pode na data sugerida`;
    lines = ["O paciente pode pedir outro horário pelo app."];
  }

  const ok = await send(email, subject, emailHtml(title, lines, cta), [title, "", ...lines, "", cta.url].join("\n"));
  if (ok) {
    await admin.from("appointment_change_requests")
      .update({ notified: { ...(r.notified ?? {}), [event]: new Date().toISOString() } })
      .eq("id", r.id);
  }
  return json({ ok }, 200, origin);
});
