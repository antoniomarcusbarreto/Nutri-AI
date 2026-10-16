// supabase/functions/teleconsult-join/index.ts
// Entrada na teleconsulta (migration 0043): cria a sala do Daily.co sob
// demanda e devolve um meeting token para QUEM CHAMA.
//
// Quem entra é decidido pelo banco (RPC teleconsult_appointment, com o JWT do
// chamador): o nutricionista responsável pela consulta ou o próprio paciente
// (portal). Secretária e outros profissionais recebem 403.
//
// Travas da sala: privada (só entra com token), nome aleatório (sem id nem
// nome do paciente), abre 10 min antes, expira 30 min depois do fim e derruba
// quem estiver dentro, sala de espera, no máximo 3 pessoas, sem gravação e
// sem guardar transcrição no Daily.
//
// Entrada: { appointment_id }. Saída: { room_url, token, role, starts_at,
// ends_at, patient_name, nutritionist_name }.
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
const DAILY_API = "https://api.daily.co/v1";
const OPEN_BEFORE_MIN = 10;
const CLOSE_AFTER_MIN = 30;

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

type Appointment = {
  id: string;
  clinic_id: string;
  role: "nutricionista" | "paciente";
  status: string;
  modality: string;
  starts_at: string;
  ends_at: string;
  patient_id: string;
  nutritionist_id: string;
  patient_name: string | null;
  nutritionist_name: string | null;
  feature_enabled: boolean;
};

type Room = { appointment_id: string; room_name: string; room_url: string; not_before: string; expires_at: string; deleted_at: string | null };

// 24 caracteres [a-z0-9]: impossível de adivinhar e sem dado pessoal na URL.
function randomRoomName() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function daily(path: string, method: string, apiKey: string, body?: unknown) {
  const res = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Daily ${method} ${path}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data as Record<string, unknown>;
}

const toEpoch = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

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

  // O banco decide quem entra (nutricionista responsável ou o paciente).
  const { data: appt, error: apptError } = await caller
    .rpc("teleconsult_appointment", { p_appointment_id: appointmentId })
    .maybeSingle<Appointment>();
  if (apptError) {
    console.error("teleconsult-join appointment:", apptError.message);
    return json({ error: "Não foi possível abrir a consulta." }, 502, origin);
  }
  if (!appt) return json({ error: "Só o nutricionista responsável e o paciente podem entrar nesta consulta." }, 403, origin);
  if (!appt.feature_enabled) return json({ error: "A teleconsulta não está disponível no seu plano." }, 403, origin);
  if (appt.modality !== "online") return json({ error: "Esta consulta é presencial." }, 409, origin);
  if (appt.status === "cancelado") return json({ error: "Esta consulta foi cancelada." }, 409, origin);

  const startsAt = new Date(appt.starts_at).getTime();
  const notBefore = new Date(startsAt - OPEN_BEFORE_MIN * 60_000).toISOString();
  const expiresAt = new Date(new Date(appt.ends_at).getTime() + CLOSE_AFTER_MIN * 60_000).toISOString();
  const now = Date.now();
  if (now < new Date(notBefore).getTime()) {
    return json({ error: `A sala abre ${OPEN_BEFORE_MIN} minutos antes do horário.`, opens_at: notBefore }, 409, origin);
  }
  if (now > new Date(expiresAt).getTime()) return json({ error: "O horário desta teleconsulta já passou." }, 409, origin);

  const apiKey = Deno.env.get("DAILY_API_KEY");
  if (!apiKey) return json({ error: "Serviço de vídeo indisponível." }, 502, origin);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const roomProperties = {
    nbf: toEpoch(notBefore),
    exp: toEpoch(expiresAt),
    eject_at_room_exp: true,
    max_participants: 3,
    enable_knocking: true,
    enable_prejoin_ui: true,
    lang: "pt-BR",
    enable_transcription_storage: false,
    // enable_recording omitido de propósito: a API não documenta um valor
    // "desligado", e sem a propriedade a sala não grava.
  };

  let room: Room | null;
  try {
    const { data: existing } = await admin.from("teleconsult_rooms")
      .select("*").eq("appointment_id", appt.id).maybeSingle<Room>();
    room = existing;

    if (room && !room.deleted_at) {
      // Consulta remarcada: ajusta a janela da sala que já existe.
      if (toEpoch(room.not_before) !== roomProperties.nbf || toEpoch(room.expires_at) !== roomProperties.exp) {
        await daily(`/rooms/${room.room_name}`, "POST", apiKey, { properties: roomProperties });
        await admin.from("teleconsult_rooms")
          .update({ not_before: notBefore, expires_at: expiresAt }).eq("appointment_id", appt.id);
      }
    } else {
      const created = await daily("/rooms", "POST", apiKey, {
        name: randomRoomName(),
        privacy: "private",
        properties: roomProperties,
      });
      const fresh = {
        appointment_id: appt.id,
        clinic_id: appt.clinic_id,
        room_name: String(created.name),
        room_url: String(created.url),
        not_before: notBefore,
        expires_at: expiresAt,
        deleted_at: null,
      };
      // Os dois podem clicar ao mesmo tempo: só uma sala vale por consulta.
      const write = room
        ? admin.from("teleconsult_rooms").update(fresh).eq("appointment_id", appt.id).not("deleted_at", "is", null).select()
        : admin.from("teleconsult_rooms").upsert(fresh, { onConflict: "appointment_id", ignoreDuplicates: true }).select();
      const { data: written, error: writeError } = await write;
      if (writeError) throw new Error(writeError.message);
      if (written && written.length) {
        room = written[0] as Room;
      } else {
        await daily(`/rooms/${fresh.room_name}`, "DELETE", apiKey).catch(() => undefined);
        const { data: winner } = await admin.from("teleconsult_rooms")
          .select("*").eq("appointment_id", appt.id).maybeSingle<Room>();
        room = winner;
      }
    }
  } catch (err) {
    console.error("teleconsult-join room:", err instanceof Error ? err.message : String(err));
    return json({ error: "Não foi possível preparar a sala de vídeo." }, 502, origin);
  }
  if (!room) return json({ error: "Não foi possível preparar a sala de vídeo." }, 502, origin);

  const isNutritionist = appt.role === "nutricionista";
  const tokenProperties: Record<string, unknown> = {
    room_name: room.room_name,
    nbf: roomProperties.nbf,
    exp: roomProperties.exp,
    eject_at_token_exp: true,
    lang: "pt-BR",
    is_owner: isNutritionist,
    user_name: isNutritionist ? "Nutricionista" : "Paciente",
    // Prefixo identifica quem fala na transcrição (n_ / p_).
    user_id: `${isNutritionist ? "n" : "p"}_${user.id}`,
    enable_screenshare: isNutritionist,
    permissions: isNutritionist
      ? { canAdmin: ["participants", "transcription"] }
      : { canAdmin: false, canSend: ["video", "audio"] },
  };

  let token: string;
  try {
    const res = await daily("/meeting-tokens", "POST", apiKey, { properties: tokenProperties });
    token = String(res.token);
  } catch (err) {
    console.error("teleconsult-join token:", err instanceof Error ? err.message : String(err));
    return json({ error: "Não foi possível liberar sua entrada na sala." }, 502, origin);
  }

  return json({
    room_url: room.room_url,
    token,
    role: appt.role,
    starts_at: appt.starts_at,
    ends_at: appt.ends_at,
    closes_at: expiresAt,
    patient_name: appt.patient_name,
    nutritionist_name: appt.nutritionist_name,
  }, 200, origin);
});
