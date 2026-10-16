// supabase/functions/teleconsult-end/index.ts
// Encerra a teleconsulta (migration 0043): apaga a sala no Daily.co na hora,
// em vez de só esperar ela expirar. Quem estiver na chamada cai.
//
// Só o NUTRICIONISTA responsável pela consulta encerra (RPC
// teleconsult_appointment com o JWT do chamador devolve role = nutricionista).
//
// Entrada: { appointment_id }. Saída: { ok: true }.
//
// Secrets: DAILY_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Opcionais: ALLOWED_ORIGINS.

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

  let appointmentId: string;
  try {
    appointmentId = String((await req.json())?.appointment_id ?? "");
  } catch {
    return json({ error: "Corpo inválido." }, 400, origin);
  }
  if (!UUID_RE.test(appointmentId)) return json({ error: "Consulta inválida." }, 400, origin);

  const { data: appt } = await caller
    .rpc("teleconsult_appointment", { p_appointment_id: appointmentId })
    .maybeSingle<{ id: string; role: string }>();
  if (!appt || appt.role !== "nutricionista") {
    return json({ error: "Só o nutricionista responsável pode encerrar a teleconsulta." }, 403, origin);
  }

  const apiKey = Deno.env.get("DAILY_API_KEY");
  if (!apiKey) return json({ error: "Serviço de vídeo indisponível." }, 502, origin);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: room } = await admin.from("teleconsult_rooms")
    .select("room_name, deleted_at").eq("appointment_id", appt.id).maybeSingle();
  if (room && !room.deleted_at) {
    const res = await fetch(`https://api.daily.co/v1/rooms/${room.room_name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    }).catch((err) => {
      console.error("teleconsult-end fetch:", err instanceof Error ? err.message : String(err));
      return null;
    });
    // 404 = a sala já não existe no Daily; segue marcando como apagada.
    if (!res || (!res.ok && res.status !== 404)) {
      if (res) console.error("teleconsult-end daily:", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return json({ error: "Não foi possível encerrar a sala agora. Ela expira sozinha após o horário." }, 502, origin);
    }
    await admin.from("teleconsult_rooms")
      .update({ deleted_at: new Date().toISOString() }).eq("appointment_id", appt.id);
  }

  return json({ ok: true }, 200, origin);
});
