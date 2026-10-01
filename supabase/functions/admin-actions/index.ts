import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase configuration missing.');
    }

    // Client for standard auth checks (using the user's JWT)
    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (bypasses RLS and has full auth.admin access)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get the user making the request
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Verify if the user is a superadmin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_superadmin) {
      return json({ error: 'Forbidden. Requires superadmin privileges.' }, 403);
    }

    // Parse request body
    const body = await req.json();
    const { action, targetUserId, newPassword, isActive } = body;

    if (!targetUserId) {
      return json({ error: 'targetUserId is required' }, 400);
    }

    // O único Master da plataforma não pode ter senha/status alterados pelo painel
    // (mesma regra de public.is_last_master, migration 0027).
    const { data: target } = await supabaseAdmin
      .from('profiles')
      .select('is_superadmin')
      .eq('id', targetUserId)
      .maybeSingle();
    if (target?.is_superadmin) {
      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_superadmin', true);
      if ((count ?? 0) <= 1) {
        return json({ error: 'O único usuário Master da plataforma não pode ter seus dados alterados.' }, 403);
      }
    }

    if (action === 'change_password') {
      if (!newPassword || newPassword.length < 8) {
        throw new Error('Nova senha inválida. Mínimo 8 caracteres.');
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (error) throw error;

      return json({ success: true, message: 'Senha atualizada com sucesso' });

    } else if (action === 'toggle_status') {
      if (isActive === undefined) {
        throw new Error('isActive status is required');
      }

      // Update in profiles
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', targetUserId);
      if (profileUpdateError) throw profileUpdateError;

      // Update ban status in auth.users
      // If inactive, ban them for ~100 years. If active, unban.
      const banDuration = isActive ? 'none' : '876000h';
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
        ban_duration: banDuration,
      });
      if (authUpdateError) throw authUpdateError;

      return json({ success: true, message: 'Status atualizado com sucesso' });

    } else {
      return json({ error: 'Ação inválida' }, 400);
    }

  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado' }, 400);
  }
});
