// supabase/functions/admin-update-user-email/index.ts
// Troca segura do e-mail de LOGIN de um membro da equipe ou paciente, iniciada
// pelo owner da clínica (SEC-03).
//
// Fluxo:
//   1. Autentica o chamador pelo JWT (cliente anon + getUser).
//   2. Com service_role, resolve a clínica do usuário-alvo e confirma que o
//      chamador é OWNER dessa clínica.
//   3. Chama auth.admin.updateUserById(targetId, { email }) — por padrão o
//      GoTrue envia um link de confirmação para o NOVO endereço; a troca só se
//      efetiva quando o link é aberto (email_confirm NÃO é passado).
//
// Secrets necessários: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://dtkoegdmmhnxsrrxmoiq.supabase.co",
  "http://localhost:5173",
  "http://localhost:4173",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, req);
  if (!ALLOWED_ORIGINS.includes(req.headers.get("Origin") ?? "")) {
    return json({ error: "Origem não permitida." }, 403, req);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Token de autenticação ausente." }, 401, req);

  let payload: { target_user_id?: string; new_email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400, req);
  }
  const targetUserId = payload.target_user_id?.trim();
  const newEmail = payload.new_email?.trim().toLowerCase();
  if (!targetUserId || !newEmail || !EMAIL_RE.test(newEmail)) {
    return json({ error: "Parâmetros inválidos." }, 400, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1. Quem está chamando?
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await caller.auth.getUser();
  if (authErr || !user) return json({ error: "Usuário não autenticado." }, 401, req);

  // 2. Autorização: chamador precisa ser OWNER da clínica do alvo.
  const admin = createClient(supabaseUrl, serviceKey);

  // Clínica do alvo: como membro da equipe ou como paciente.
  const [{ data: memberRows }, { data: patientRows }] = await Promise.all([
    admin.from("clinic_members").select("clinic_id").eq("user_id", targetUserId),
    admin.from("patients").select("clinic_id").eq("user_id", targetUserId),
  ]);
  const targetClinicIds = new Set<string>([
    ...(memberRows ?? []).map((r) => r.clinic_id),
    ...(patientRows ?? []).map((r) => r.clinic_id),
  ]);
  if (targetClinicIds.size === 0) {
    return json({ error: "Usuário-alvo não encontrado." }, 404, req);
  }

  const { data: ownerRows } = await admin
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", user.id)
    .eq("role", "owner");
  const callerOwnerClinics = new Set<string>((ownerRows ?? []).map((r) => r.clinic_id));

  const authorized = [...targetClinicIds].some((c) => callerOwnerClinics.has(c));
  if (!authorized) {
    return json({ error: "Acesso negado. Apenas o proprietário da clínica pode alterar o e-mail." }, 403, req);
  }

  // 3. Dispara a troca com confirmação (não passa email_confirm).
  const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
    email: newEmail,
  });
  if (updErr) {
    console.error("admin-update-user-email:", updErr.message);
    return json({ error: "Não foi possível iniciar a troca de e-mail." }, 502, req);
  }

  return json(
    { ok: true, message: "Enviamos um link de confirmação para o novo e-mail." },
    200,
    req,
  );
});
