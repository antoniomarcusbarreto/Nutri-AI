import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';

/**
 * Preferências do resumo por e-mail (migration 0041). Cada membro da equipe
 * tem a sua linha; sem linha = desativado (opt-in). O envio é da edge function
 * `email-digest`, chamada pelo pg_cron.
 */
export interface EmailDigestSettings {
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  weekdays: number[];
  /** "HH:MM" */
  sendTime: string;
  weeklyEnabled: boolean;
}

export const DEFAULT_DIGEST_SETTINGS: EmailDigestSettings = {
  enabled: false,
  weekdays: [1, 2, 3, 4, 5, 6],
  sendTime: '06:00',
  weeklyEnabled: true,
};

export function useEmailDigestSettings(userId: string | undefined) {
  return useQuery({
    queryKey: qk.emailDigest.settings(userId ?? 'none'),
    enabled: !!userId,
    queryFn: async (): Promise<EmailDigestSettings> => {
      const { data, error } = await supabase
        .from('email_digest_settings')
        .select('enabled, weekdays, send_time, weekly_enabled')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_DIGEST_SETTINGS;
      return {
        enabled: data.enabled,
        weekdays: data.weekdays ?? DEFAULT_DIGEST_SETTINGS.weekdays,
        sendTime: String(data.send_time ?? '06:00').slice(0, 5),
        weeklyEnabled: data.weekly_enabled,
      };
    },
  });
}

export function useSaveEmailDigestSettings(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (s: EmailDigestSettings) => {
      const { error } = await supabase.from('email_digest_settings').upsert({
        user_id: userId!,
        enabled: s.enabled,
        weekdays: [...s.weekdays].sort(),
        send_time: s.sendTime,
        weekly_enabled: s.weeklyEnabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.emailDigest.settings(userId ?? 'none') }),
  });
}

/** "Enviar um exemplo agora": manda o resumo com os dados reais para o próprio e-mail. */
export function useSendDigestPreview() {
  return useMutation({
    mutationFn: async (kind: 'daily' | 'weekly'): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke('email-digest', { body: { mode: 'preview', kind } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let message = 'Não foi possível enviar o exemplo.';
        if (ctx && typeof ctx.status === 'number') {
          try {
            const body = await ctx.clone().json();
            if (body?.error) message = body.error;
          } catch {
            // corpo não-JSON
          }
        }
        throw new Error(message);
      }
      return (data as { email?: string } | null)?.email ?? null;
    },
  });
}
