import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';

/**
 * Mutations de lembretes com invalidação de cache (Onda 4).
 * Cada mutation invalida `qk.reminders.all` — o TanStack Query refaz só as
 * queries de lembrete ativas na tela.
 */
export function useReminderMutations() {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: qk.reminders.all });

  const add = useMutation({
    mutationFn: async (input: { clinicId: string; userId: string; description: string; dueDate: string }) => {
      const { data, error } = await supabase
        .from('reminders')
        .insert([{
          clinic_id: input.clinicId,
          user_id: input.userId,
          description: input.description,
          due_date: input.dueDate,
        }])
        .select('*, profiles:user_id(full_name)')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const toggle = useMutation({
    mutationFn: async (input: { id: string; isCompleted: boolean }) => {
      const { error } = await supabase
        .from('reminders')
        .update({ is_completed: !input.isCompleted })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, toggle, remove };
}
