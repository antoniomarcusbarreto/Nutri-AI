// supabase/functions/reset-password-with-code/index.ts
// Etapa 2 da recuperação de senha self-service: valida o código de 6 dígitos
// enviado por `send-password-reset-code` e, se correto, troca a senha via
// Admin API (mesmo padrão de `admin-update-user-email`, mas usando
// `updateUserById` com `password`).
//
// Regras (replicadas do DoseCerta-AI):
//   - Código expira em 10 minutos.
//   - Máximo de 5 tentativas; ao estourar, invalida o código.
//   - Uso único: o registro é apagado em caso de sucesso, expiração ou
//     limite de tentativas excedido.
//
// Secrets necessários: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Rota pública (sem Authorization) — o usuário ainda não está logado.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE_ORIGINS = [
  "https://nutri-ai.io",
  "https://www.nutri-ai.io",
  "https://dtkoegdmmhnxsrrxmoiq.supabase.co",
  "http://localhost:5173",
  "http://localhost:4173",
];
const EXTRA_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = [...BASE_ORIGINS, ...EXTRA_ORIGINS];

const MAX_TENTATIVAS = 5;

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
const SENHA_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

async function hashCodigo(codigo: string): Promise<string> {
  const bytes = new TextEncoder().encode(codigo);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, req);
  if (!ALLOWED_ORIGINS.includes(req.headers.get("Origin") ?? "")) {
    return json({ error: "Origem não permitida." }, 403, req);
  }

  let payload: { email?: string; code?: string; newPassword?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400, req);
  }
  const email = payload.email?.trim().toLowerCase();
  const code = payload.code?.trim();
  const newPassword = payload.newPassword ?? "";

  if (!email || !EMAIL_RE.test(email) || !code) {
    return json({ error: "Parâmetros inválidos." }, 400, req);
  }
  if (!SENHA_RE.test(newPassword)) {
    return json({ error: "A nova senha precisa ter pelo menos 8 caracteres, uma letra maiúscula e um número." }, 400, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userId } = await admin.rpc("get_user_id_by_email", { p_email: email });
  if (!userId) {
    return json({ error: "Código incorreto." }, 400, req);
  }

  const { data: registro } = await admin
    .from("password_reset_codes")
    .select("code_hash, expires_at, attempts")
    .eq("user_id", userId)
    .maybeSingle();

  if (!registro) {
    return json({ error: "Solicite um novo código." }, 400, req);
  }

  if (new Date(registro.expires_at).getTime() < Date.now()) {
    await admin.from("password_reset_codes").delete().eq("user_id", userId);
    return json({ error: "Código expirado. Solicite um novo." }, 400, req);
  }

  if (registro.attempts >= MAX_TENTATIVAS) {
    await admin.from("password_reset_codes").delete().eq("user_id", userId);
    return json({ error: "Muitas tentativas. Solicite um novo código." }, 429, req);
  }

  if ((await hashCodigo(code)) !== registro.code_hash) {
    await admin
      .from("password_reset_codes")
      .update({ attempts: registro.attempts + 1 })
      .eq("user_id", userId);
    return json({ error: "Código incorreto." }, 400, req);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (updErr) {
    console.error("[reset-password-with-code] falha ao atualizar senha", userId, updErr.message);
    return json({ error: "Não foi possível redefinir a senha. Tente novamente." }, 502, req);
  }

  await admin.from("password_reset_codes").delete().eq("user_id", userId);

  return json({ ok: true, message: "Senha redefinida com sucesso." }, 200, req);
});
