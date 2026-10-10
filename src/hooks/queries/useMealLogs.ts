import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { scaleMacros, sumItems, type MealItem, type MealLog } from '../../lib/mealLog';

/**
 * Diário de refeições (migration 0036): o paciente registra pelo portal; o
 * nutricionista acompanha (só leitura) no Acompanhamento.
 */

const KEY = (patientId: string, days: number) => ['meal_logs', patientId, days] as const;

const errorMessageFromFn = async (error: unknown, fallback: string) => {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.status === 'number') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // corpo não-JSON
    }
  }
  return fallback;
};

/** Registros dos últimos `days` dias (mais recentes primeiro). Vale para paciente e equipe (RLS recorta). */
export function useMealLogs(patientId: string | undefined, days = 30) {
  return useQuery({
    queryKey: KEY(patientId ?? 'none', days),
    enabled: !!patientId,
    // Enquanto há análise em andamento, atualiza sozinho.
    refetchInterval: (q) => ((q.state.data as MealLog[] | undefined)?.some((m) => m.status === 'analyzing') ? 3000 : false),
    queryFn: async (): Promise<MealLog[]> => {
      const { data, error } = await supabase
        .from('meal_logs')
        .select('*')
        .eq('patient_id', patientId!)
        .gte('eaten_at', subDays(new Date(), days).toISOString())
        .order('eaten_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []).map((m) => ({ ...m, consumed_pct: m.consumed_pct == null ? null : Number(m.consumed_pct) })) as MealLog[];
    },
  });
}

/** URLs assinadas (1h) das fotos dos registros. */
export function useMealPhotoUrls(paths: string[]) {
  const list = [...new Set(paths.filter(Boolean))];
  return useQuery({
    queryKey: ['meal_photos', ...list],
    enabled: list.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from('meal-photos').createSignedUrls(list, 3600);
      if (error) throw error;
      const out: Record<string, string> = {};
      list.forEach((p, i) => {
        if (data?.[i]?.signedUrl) out[p] = data[i].signedUrl;
      });
      return out;
    },
  });
}

export function useMealLogMutations(patientId: string | undefined, clinicId: string | undefined) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ['meal_logs', patientId ?? 'none'] });

  /** Cria o registro e dispara a análise (foto já reduzida no cliente, ou texto). */
  const create = useMutation({
    mutationFn: async (input: { mealKey: string | null; eatenAt: Date; photo?: Blob; description?: string }) => {
      if (!patientId || !clinicId) throw new Error('Sem paciente.');
      let photoPath: string | null = null;
      if (input.photo) {
        photoPath = `${patientId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from('meal-photos').upload(photoPath, input.photo, { contentType: 'image/jpeg' });
        if (error) throw new Error('Não foi possível enviar a foto. Confira a conexão e tente de novo.');
      }
      const { data, error } = await supabase.from('meal_logs').insert({
        patient_id: patientId,
        clinic_id: clinicId,
        source: input.photo ? 'foto' : 'texto',
        photo_path: photoPath,
        description: input.photo ? null : input.description?.trim(),
        meal_key: input.mealKey,
        eaten_at: input.eatenAt.toISOString(),
        status: 'analyzing',
      }).select('id').single();
      if (error) throw error;
      // A análise grava o resultado no próprio registro; a lista atualiza sozinha.
      const { error: fnError } = await supabase.functions.invoke('meal-analyze', { body: { meal_log_id: data.id } });
      if (fnError) throw new Error(await errorMessageFromFn(fnError, 'Não foi possível analisar agora. Tente novamente.'));
      return data.id as string;
    },
    onSettled: invalidate,
  });

  /** Revisão dos itens (antes de confirmar). */
  const updateItems = useMutation({
    mutationFn: async (input: { id: string; items: MealItem[] }) => {
      const { error } = await supabase.from('meal_logs')
        .update({ items: input.items, base_macros: sumItems(input.items), updated_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** "Quanto você comeu?" — calcula o consumido UMA vez e salva no diário. */
  const confirm = useMutation({
    mutationFn: async (input: { log: MealLog; pct: number; mealKey?: string | null }) => {
      const base = input.log.base_macros ?? sumItems(input.log.items);
      const { error } = await supabase.from('meal_logs').update({
        status: 'completed',
        consumed_pct: input.pct,
        macros: scaleMacros(base, input.pct),
        ...(input.mealKey !== undefined ? { meal_key: input.mealKey } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', input.log.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (log: MealLog) => {
      if (log.photo_path) await supabase.storage.from('meal-photos').remove([log.photo_path]);
      const { error } = await supabase.from('meal_logs').delete().eq('id', log.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, updateItems, confirm, remove };
}
