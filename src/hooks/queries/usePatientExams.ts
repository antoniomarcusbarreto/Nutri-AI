import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import type { ExamRecord } from '../../types/clinical';

/**
 * Histórico de exames de um paciente, JÁ com `ai_feedback` (Onda 4).
 *
 * `select('*')` traz o `ai_feedback` completo — então NÃO existe mais o
 * `useEffect [selectedExam?.id]` que rebuscava só esse campo (PERF-04). O
 * parecer/alertas/biomarcadores viram `useMemo` derivado de
 * `exam.ai_feedback` no componente.
 */
export function usePatientExams(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.patientExams.byPatient(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<ExamRecord[]> => {
      const { data, error } = await supabase
        .from('patient_exams')
        .select('*')
        .eq('patient_id', patientId!)
        .order('exam_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExamRecord[];
    },
  });
}

/** Escrita otimista do `ai_feedback` no cache, sem refetch. */
export function useExamCache(patientId: string | undefined) {
  const client = useQueryClient();
  const key = qk.patientExams.byPatient(patientId ?? 'none');

  return {
    /** Substitui/insere um exame no cache local (após update/analyze). */
    upsertExam: (exam: ExamRecord) => {
      client.setQueryData<ExamRecord[]>(key, (prev) =>
        prev ? prev.map((e) => (e.id === exam.id ? { ...e, ...exam } : e)) : prev,
      );
    },
    /** Remove um exame do cache (após delete). */
    removeExam: (examId: string) => {
      client.setQueryData<ExamRecord[]>(key, (prev) => prev?.filter((e) => e.id !== examId) ?? prev);
    },
    /** Força recarga (após upload, quando não temos a linha completa). */
    invalidate: () => client.invalidateQueries({ queryKey: key }),
  };
}
