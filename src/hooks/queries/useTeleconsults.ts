import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import {
  getTranscriptSegments, TRANSCRIPT_COLUMNS, type TeleconsultTranscript,
} from '../../lib/teleconsult';

/**
 * Transcrições de teleconsulta do paciente (migration 0044). O RLS entrega só
 * as do próprio nutricionista (inclusive rascunhos) e as salvas que alguém
 * compartilhou com ele.
 */
export function usePatientTeleconsults(patientId: string | undefined) {
  return useQuery({
    queryKey: qk.teleconsults.byPatient(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<TeleconsultTranscript[]> => {
      const { data, error } = await supabase
        .from('teleconsult_transcripts')
        .select(TRANSCRIPT_COLUMNS)
        .eq('patient_id', patientId!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TeleconsultTranscript[];
    },
  });
}

export function useTranscriptSegments(transcriptId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.teleconsults.segments(transcriptId),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => getTranscriptSegments(transcriptId),
  });
}

export interface TranscriptShare {
  id: string;
  grantee_id: string;
  created_at: string;
  profiles?: { full_name?: string | null } | null;
}

export function useTranscriptShares(transcriptId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.teleconsults.shares(transcriptId),
    enabled,
    queryFn: async (): Promise<TranscriptShare[]> => {
      const { data, error } = await supabase
        .from('teleconsult_transcript_shares')
        .select('id, grantee_id, created_at, profiles:grantee_id ( full_name )')
        .eq('transcript_id', transcriptId)
        .is('revoked_at', null)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as TranscriptShare[];
    },
  });
}

export function useShareTranscript(transcriptId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.teleconsults.shares(transcriptId) });
  const share = useMutation({
    mutationFn: async (granteeId: string) => {
      const { error } = await supabase.rpc('share_teleconsult_transcript', { p_transcript_id: transcriptId, p_grantee_id: granteeId });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  const revoke = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.rpc('revoke_teleconsult_share', { p_share_id: shareId });
      if (error) throw error;
    },
    onSettled: invalidate,
  });
  return { share, revoke };
}
