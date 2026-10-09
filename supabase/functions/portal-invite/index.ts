// supabase/functions/portal-invite/index.ts
// Aceite do convite do Portal do Paciente (migration 0031).
//
// O nutricionista gera o convite pela RPC `create_portal_invite` (link de uso
// único, 72h, só o hash do token fica no banco). Esta função atende a página
// pública /convite/:token em três passos:
//
//   peek      {token}                  → e-mail mascarado, nome do nutricionista e da clínica
//   send_code {token}                  → código de 6 dígitos para o e-mail CADASTRADO pelo
//                                        nutricionista (o paciente nunca digita o e-mail, então
//                                        repassar o link não dá acesso a terceiros)
//   accept    {token, code, password}  → cria ou vincula a conta de login, grava a senha,
//                                        marca o convite como usado e devolve o e-mail de login
//
// Regras do código (mesmas de `reset-password-with-code`): 60s entre envios,
// expira em 10 minutos, 5 tentativas.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
// Rota pública (verify_jwt = false) — o paciente ainda não tem conta.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

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

const REMETENTE = "Nutri-AI <suporte@notificacoes.codehatch.com.br>";
const RESPONDER_PARA = "suporte@codehatch.com.br";
const COOLDOWN_MS = 60 * 1000;
const CODIGO_EXPIRA_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 5;
const SENHA_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

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

async function sha256(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function gerarCodigo(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return (100000 + n).toString();
}

function mascararEmail(email: string): string {
  const [user, dominio] = email.split("@");
  const visivel = user.slice(0, Math.min(2, Math.max(1, user.length - 1)));
  return `${visivel}${"*".repeat(Math.max(3, user.length - visivel.length))}@${dominio}`;
}

function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

type Convite = {
  id: string;
  patient_id: string;
  clinic_id: string;
  expires_at: string;
  code_hash: string | null;
  code_expires_at: string | null;
  code_sent_at: string | null;
  code_attempts: number;
  used_at: string | null;
  revoked_at: string | null;
};

type Paciente = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  nutritionist_id: string;
  clinic_id: string;
  phone: string | null;
};

const LINK_INVALIDO = "Este link de convite não é mais válido. Peça um novo link ao seu nutricionista.";

async function carregarConvite(admin: SupabaseClient, token: string) {
  const { data: convite } = await admin
    .from("patient_portal_invites")
    .select("id, patient_id, clinic_id, expires_at, code_hash, code_expires_at, code_sent_at, code_attempts, used_at, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle<Convite>();

  if (!convite || convite.used_at || convite.revoked_at || new Date(convite.expires_at).getTime() < Date.now()) {
    return null;
  }

  const { data: paciente } = await admin
    .from("patients")
    .select("id, name, email, user_id, nutritionist_id, clinic_id, phone")
    .eq("id", convite.patient_id)
    .maybeSingle<Paciente>();
  if (!paciente?.email) return null;

  return { convite, paciente, email: paciente.email.trim().toLowerCase() };
}

// Conta da equipe ou do Master nunca vira login de paciente.
async function ehContaDaEquipe(admin: SupabaseClient, userId: string): Promise<boolean> {
  const [{ count }, { data: perfil }] = await Promise.all([
    admin.from("clinic_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("profiles").select("is_superadmin").eq("id", userId).maybeSingle(),
  ]);
  return (count ?? 0) > 0 || perfil?.is_superadmin === true;
}

function montarEmailHtml(codigo: string, nutricionista: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Seu código de acesso</title></head>
  <body style="margin:0; padding:0; background-color:#eef1f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4; padding: 32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden;">
          <tr><td style="background-color:#0f172a; padding: 28px 32px;">
            <span style="font-size:22px; font-weight:800; color:#ffffff;">Nutri<span style="color:#5024fc;">-AI</span></span>
          </td></tr>
          <tr><td style="padding: 32px;">
            <p style="margin:0 0 8px; font-size:16px; color:#1e293b;">Olá,</p>
            <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#475569;">
              ${nutricionista ? `${nutricionista} liberou` : "Seu nutricionista liberou"} seu acesso ao app de acompanhamento. Use o código abaixo para criar sua senha:
            </p>
            <div style="text-align:center;">
              <div style="display:inline-block; background-color:#ede9fe; border:2px solid #5024fc; border-radius:14px; padding:20px 32px; font-family: 'Courier New', Courier, monospace; font-size:36px; font-weight:700; letter-spacing:10px; color:#431cdb;">${codigo}</div>
            </div>
            <p style="margin:24px 0 0; text-align:center; font-size:13px; color:#94a3b8;">Este código expira em 10 minutos.</p>
            <p style="margin:24px 0 0; font-size:14px; line-height:1.6; color:#475569;">
              Se você não pediu este acesso, ignore este e-mail.
            </p>
          </td></tr>
          <tr><td style="padding: 20px 32px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
            <p style="margin:0; font-size:12px; color:#94a3b8;">Precisa de ajuda? Escreva para
              <a href="mailto:${RESPONDER_PARA}" style="color:#5024fc; text-decoration:none;">${RESPONDER_PARA}</a>.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function enviarCodigo(email: string, codigo: string, nutricionista: string): Promise<boolean> {
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: email,
      reply_to: RESPONDER_PARA,
      subject: "Seu código de acesso ao app - Nutri-AI",
      html: montarEmailHtml(codigo, nutricionista),
      text: [
        "Olá,",
        "",
        `${nutricionista || "Seu nutricionista"} liberou seu acesso ao app de acompanhamento do Nutri-AI.`,
        `Código: ${codigo}`,
        "",
        "Este código expira em 10 minutos. Se você não pediu este acesso, ignore este e-mail.",
      ].join("\n"),
    }),
  });
  if (!resposta.ok) {
    console.error("[portal-invite] falha ao enviar via Resend", resposta.status, await resposta.text());
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, req);
  if (!ALLOWED_ORIGINS.includes(req.headers.get("Origin") ?? "")) {
    return json({ error: "Origem não permitida." }, 403, req);
  }

  let payload: { action?: string; token?: string; code?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400, req);
  }
  const token = payload.token?.trim().toLowerCase() ?? "";
  if (!TOKEN_RE.test(token)) return json({ error: LINK_INVALIDO }, 404, req);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const carregado = await carregarConvite(admin, token);
  if (!carregado) return json({ error: LINK_INVALIDO }, 404, req);
  const { convite, paciente, email } = carregado;

  const [{ data: nutri }, { data: clinica }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", paciente.nutritionist_id).maybeSingle(),
    admin.from("clinics").select("name").eq("id", paciente.clinic_id).maybeSingle(),
  ]);
  const nomeNutri = nutri?.full_name ?? "";

  // ---------------------------------------------------------------- peek
  if (payload.action === "peek") {
    return json({
      ok: true,
      patient_first_name: primeiroNome(paciente.name),
      masked_email: mascararEmail(email),
      nutritionist_name: nomeNutri,
      clinic_name: clinica?.name ?? "",
      has_account: !!paciente.user_id,
    }, 200, req);
  }

  // ----------------------------------------------------------- send_code
  if (payload.action === "send_code") {
    if (convite.code_sent_at && Date.now() - new Date(convite.code_sent_at).getTime() < COOLDOWN_MS) {
      return json({ error: "Aguarde um minuto antes de pedir outro código." }, 429, req);
    }
    const codigo = gerarCodigo();
    if (!(await enviarCodigo(email, codigo, nomeNutri))) {
      return json({ error: "Não foi possível enviar o e-mail. Tente novamente." }, 502, req);
    }
    const { error } = await admin.from("patient_portal_invites").update({
      code_hash: await sha256(codigo),
      code_expires_at: new Date(Date.now() + CODIGO_EXPIRA_MS).toISOString(),
      code_sent_at: new Date().toISOString(),
      code_attempts: 0,
    }).eq("id", convite.id);
    if (error) {
      console.error("[portal-invite] falha ao gravar código", error.message);
      return json({ error: "Não foi possível gerar o código. Tente novamente." }, 500, req);
    }
    return json({ ok: true, masked_email: mascararEmail(email) }, 200, req);
  }

  // -------------------------------------------------------------- accept
  if (payload.action === "accept") {
    const code = payload.code?.trim() ?? "";
    const password = payload.password ?? "";
    if (!/^\d{6}$/.test(code)) return json({ error: "Digite o código de 6 dígitos." }, 400, req);
    if (!SENHA_RE.test(password)) {
      return json({ error: "A senha precisa ter pelo menos 8 caracteres, uma letra maiúscula e um número." }, 400, req);
    }
    if (!convite.code_hash || !convite.code_expires_at) {
      return json({ error: "Peça o código primeiro." }, 400, req);
    }
    if (new Date(convite.code_expires_at).getTime() < Date.now()) {
      return json({ error: "Código expirado. Peça um novo." }, 400, req);
    }
    if (convite.code_attempts >= MAX_TENTATIVAS) {
      await admin.from("patient_portal_invites").update({ code_hash: null, code_expires_at: null }).eq("id", convite.id);
      return json({ error: "Muitas tentativas. Peça um novo código." }, 429, req);
    }
    if ((await sha256(code)) !== convite.code_hash) {
      await admin.from("patient_portal_invites")
        .update({ code_attempts: convite.code_attempts + 1 }).eq("id", convite.id);
      return json({ error: "Código incorreto." }, 400, req);
    }

    // Conta bloqueada pela equipe (toggle_patient_status) continua bloqueada:
    // gerar um convite novo já reativa a conta (create_portal_invite).
    // Conta de login: a já vinculada ao paciente, ou uma existente com este
    // e-mail (paciente de outra clínica — a mesma pessoa, que acabou de provar
    // ser dona do e-mail), ou uma nova.
    let userId = paciente.user_id;
    if (!userId) {
      const { data: existente } = await admin.rpc("get_user_id_by_email", { p_email: email });
      userId = (existente as string | null) ?? null;
    }

    if (userId) {
      if (await ehContaDaEquipe(admin, userId)) {
        return json({ error: "Este e-mail pertence a uma conta da equipe. Peça ao nutricionista para cadastrar outro e-mail." }, 409, req);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { email, password, email_confirm: true });
      if (error) {
        console.error("[portal-invite] falha ao atualizar conta", userId, error.message);
        return json({ error: "Não foi possível concluir o acesso. Tente novamente." }, 502, req);
      }
    } else {
      const { data: criado, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: paciente.name },
      });
      if (error || !criado.user) {
        console.error("[portal-invite] falha ao criar conta", error?.message);
        return json({ error: "Não foi possível criar sua conta. Tente novamente." }, 502, req);
      }
      userId = criado.user.id;
    }

    const { error: perfilErr } = await admin.from("profiles")
      .upsert({ id: userId, full_name: paciente.name, phone: paciente.phone }, { onConflict: "id" });
    if (perfilErr) console.error("[portal-invite] falha ao gravar perfil", perfilErr.message);

    const { error: vinculoErr } = await admin.from("patients").update({ user_id: userId }).eq("id", paciente.id);
    if (vinculoErr) {
      console.error("[portal-invite] falha ao vincular paciente", vinculoErr.message);
      return json({ error: "Não foi possível concluir o acesso. Tente novamente." }, 500, req);
    }

    await admin.from("patient_portal_invites").update({
      used_at: new Date().toISOString(),
      code_hash: null,
      code_expires_at: null,
    }).eq("id", convite.id);

    return json({ ok: true, email }, 200, req);
  }

  return json({ error: "Ação inválida." }, 400, req);
});
