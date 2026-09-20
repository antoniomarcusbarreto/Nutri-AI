// supabase/functions/send-password-reset-code/index.ts
// Etapa 1 da recuperação de senha self-service: gera um código de 6 dígitos,
// guarda o hash (SHA-256) na tabela `password_reset_codes` e envia o código
// por e-mail via Resend (mesmo padrão usado no DoseCerta-AI).
//
// Fluxo:
//   1. Resolve o user_id a partir do e-mail via RPC `get_user_id_by_email`
//      (service_role). Se não existir, responde sucesso genérico mesmo assim
//      — evita enumeração de contas cadastradas.
//   2. Respeita cooldown de 60s entre pedidos (baseado no `created_at` do
//      código pendente, se houver).
//   3. Gera o código, envia por e-mail e só então grava (upsert) o hash com
//      expiração de 10 minutos — se o envio falhar, nada é persistido.
//
// Secrets necessários: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.
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

const REMETENTE = "Nutri-AI <suporte@notificacoes.codehatch.com.br>";
const RESPONDER_PARA = "suporte@codehatch.com.br";
const COOLDOWN_MS = 60 * 1000;
const EXPIRACAO_MS = 10 * 60 * 1000;
const EXPIRACAO_MINUTOS = EXPIRACAO_MS / 60_000;

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

async function hashCodigo(codigo: string): Promise<string> {
  const bytes = new TextEncoder().encode(codigo);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function gerarCodigo(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function montarEmailHtml(codigo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Código de redefinição de senha</title>
    <style>
      @media (max-width: 600px) {
        .container { width: 100% !important; }
        .codigo { font-size: 28px !important; letter-spacing: 6px !important; padding: 16px 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:#eef1f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef1f4; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);">
            <tr>
              <td style="background-color:#0f172a; padding: 28px 32px;">
                <span style="font-size:22px; font-weight:800; color:#ffffff;">Nutri<span style="color:#5024fc;">-AI</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <p style="margin:0 0 8px; font-size:16px; color:#1e293b;">Olá,</p>
                <p style="margin:0 0 24px; font-size:15px; line-height:1.6; color:#475569;">
                  Recebemos uma solicitação para redefinir a senha da sua conta. Use o código abaixo para continuar:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <div class="codigo" style="display:inline-block; background-color:#ede9fe; border:2px solid #5024fc; border-radius:14px; padding:20px 32px; font-family: 'Courier New', Courier, monospace; font-size:36px; font-weight:700; letter-spacing:10px; color:#431cdb;">
                        ${codigo}
                      </div>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0; text-align:center; font-size:13px; color:#94a3b8;">
                  ⏱️ Este código expira em ${EXPIRACAO_MINUTOS} minutos.
                </p>
                <p style="margin:24px 0 0; font-size:14px; line-height:1.6; color:#475569;">
                  Se você não solicitou essa redefinição, pode ignorar este e-mail com segurança — sua senha continuará a mesma.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px; background-color:#f8fafc; border-top:1px solid #e2e8f0;">
                <p style="margin:0; font-size:12px; color:#94a3b8;">
                  Precisa de ajuda? Responda este e-mail ou fale com a gente em
                  <a href="mailto:${RESPONDER_PARA}" style="color:#5024fc; text-decoration:none;">${RESPONDER_PARA}</a>.
                </p>
                <p style="margin:8px 0 0; font-size:12px; color:#cbd5e1;">Equipe Nutri-AI</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function montarEmailTexto(codigo: string): string {
  return [
    "Olá,",
    "",
    "Recebemos uma solicitação para redefinir a senha da sua conta no Nutri-AI.",
    `Código: ${codigo}`,
    "",
    `Este código expira em ${EXPIRACAO_MINUTOS} minutos.`,
    "Se você não solicitou essa redefinição, ignore este e-mail.",
    "",
    "Equipe Nutri-AI",
  ].join("\n");
}

async function enviarEmailComCodigo(email: string, codigo: string): Promise<boolean> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: email,
      reply_to: RESPONDER_PARA,
      subject: "Código de redefinição de senha - Nutri-AI",
      html: montarEmailHtml(codigo),
      text: montarEmailTexto(codigo),
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    console.error("[send-password-reset-code] falha ao enviar via Resend", resposta.status, corpo);
    return false;
  }
  return true;
}

const MENSAGEM_GENERICA = {
  ok: true,
  message: "Se esse e-mail estiver cadastrado, você vai receber um código em instantes.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405, req);
  if (!ALLOWED_ORIGINS.includes(req.headers.get("Origin") ?? "")) {
    return json({ error: "Origem não permitida." }, 403, req);
  }

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400, req);
  }
  const email = payload.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: "Informe um e-mail válido." }, 400, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userId } = await admin.rpc("get_user_id_by_email", { p_email: email });
  if (!userId) {
    // E-mail não cadastrado: responde igual ao caso de sucesso (sem enumeração).
    return json(MENSAGEM_GENERICA, 200, req);
  }

  const { data: existente } = await admin
    .from("password_reset_codes")
    .select("created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (existente && Date.now() - new Date(existente.created_at).getTime() < COOLDOWN_MS) {
    return json({ error: "Aguarde um minuto antes de solicitar outro código." }, 429, req);
  }

  const codigo = gerarCodigo();
  const enviado = await enviarEmailComCodigo(email, codigo);
  if (!enviado) {
    return json({ error: "Não foi possível enviar o e-mail. Tente novamente." }, 502, req);
  }

  const { error: upsertError } = await admin.from("password_reset_codes").upsert({
    user_id: userId,
    code_hash: await hashCodigo(codigo),
    expires_at: new Date(Date.now() + EXPIRACAO_MS).toISOString(),
    attempts: 0,
    created_at: new Date().toISOString(),
  });
  if (upsertError) {
    console.error("[send-password-reset-code] falha ao gravar código", upsertError.message);
    return json({ error: "Não foi possível gerar o código. Tente novamente." }, 500, req);
  }

  return json(MENSAGEM_GENERICA, 200, req);
});
