// supabase/functions/teleconsult-cleanup/index.ts
// Faxina das salas de teleconsulta (migration 0043). Roda pelo pg_cron a cada
// 30 min e apaga no Daily.co as salas que já expiraram e ninguém encerrou.
//
// Publicar com --no-verify-jwt (o cron não manda JWT): a autorização é o
// header x-cron-secret, igual ao email-digest.
//
// Secrets: DAILY_API_KEY, TELECONSULT_CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);
  const secret = Deno.env.get("TELECONSULT_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Não autorizado." }, 401);

  const apiKey = Deno.env.get("DAILY_API_KEY");
  if (!apiKey) return json({ error: "DAILY_API_KEY ausente." }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: rooms, error } = await admin.from("teleconsult_rooms")
    .select("appointment_id, room_name")
    .is("deleted_at", null)
    .lt("expires_at", new Date().toISOString())
    .limit(100);
  if (error) {
    console.error("[teleconsult-cleanup] select:", error.message);
    return json({ error: "Falha ao listar salas." }, 500);
  }

  let deleted = 0;
  for (const room of rooms ?? []) {
    try {
      const res = await fetch(`https://api.daily.co/v1/rooms/${room.room_name}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok && res.status !== 404) {
        console.error("[teleconsult-cleanup] daily:", room.room_name, res.status);
        continue;
      }
      await admin.from("teleconsult_rooms")
        .update({ deleted_at: new Date().toISOString() }).eq("appointment_id", room.appointment_id);
      deleted++;
    } catch (err) {
      console.error("[teleconsult-cleanup]", room.room_name, err instanceof Error ? err.message : String(err));
    }
  }
  return json({ ok: true, deleted }, 200);
});
