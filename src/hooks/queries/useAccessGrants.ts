import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';

/**
 * Isolamento por nutricionista (migration 0029): cada profissional vê só os
 * próprios pacientes. Para ver os de um colega, pede acesso e o colega aprova
 * — ou o Master concede. Tudo passa por RPCs; a tabela não aceita escrita direta.
 */

export interface ClinicProfessionalOption {
  id: string;
  full_name: string;
  role: 'owner' | 'nutritionist';
}

/** Profissionais ATIVOS (dono/nutricionista) da clínica — para escolher responsável ou colega. */
export function useClinicProfessionals(clinicId: string | undefined) {
  return useQuery({
    queryKey: qk.clinicProfessionals(clinicId ?? 'none'),
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ClinicProfessionalOption[]> => {
      const { data, error } = await supabase.rpc('get_clinic_staff', { p_clinic_id: clinicId });
      if (error) throw error;
      return ((data ?? []) as { user_id: string; full_name: string; role: string; is_active: boolean }[])
        .filter((m) => (m.role === 'owner' || m.role === 'nutritionist') && m.is_active !== false)
        .map((m) => ({ id: m.user_id, full_name: m.full_name, role: m.role as 'owner' | 'nutritionist' }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });
}

export type AccessGrantStatus = 'pending' | 'approved' | 'denied' | 'revoked' | 'expired';

export interface AccessGrant {
  id: string;
  clinic_id: string;
  status: AccessGrantStatus;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  decided_at: string | null;
  owner_nutritionist_id: string;
  owner_name: string;
  grantee_id: string;
  grantee_name: string;
  patient_id: string | null;
  patient_name: string | null;
}

/** Concessões em que o usuário é parte (ou todas, para o Master). */
export function useAccessGrants(enabled = true) {
  return useQuery({
    queryKey: qk.accessGrants.mine,
    enabled,
    queryFn: async (): Promise<AccessGrant[]> => {
      const { data, error } = await supabase.rpc('list_patient_access_grants');
      if (error) throw error;
      return (data ?? []) as AccessGrant[];
    },
  });
}

export interface RequestablePatient {
  patient_id: string;
  patient_name: string;
  owner_nutritionist_id: string;
  owner_name: string;
}

/** Pacientes de colegas que têm consulta comigo, mas cujo prontuário não acesso. */
export function useRequestablePatients(enabled = true) {
  return useQuery({
    queryKey: qk.accessGrants.requestable,
    enabled,
    queryFn: async (): Promise<RequestablePatient[]> => {
      const { data, error } = await supabase.rpc('list_requestable_patients');
      if (error) throw error;
      return (data ?? []) as RequestablePatient[];
    },
  });
}

/** Mutations de concessão. Invalida concessões e pacientes (o acesso muda o que o RLS devolve). */
export function useAccessGrantMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.accessGrants.all });
    void queryClient.invalidateQueries({ queryKey: qk.patients.all });
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args);
    if (error) throw error;
  };

  return {
    request: useMutation({
      mutationFn: (v: { ownerId: string; patientId?: string | null; reason?: string }) =>
        rpc('request_patient_access', {
          p_owner_nutritionist_id: v.ownerId,
          p_patient_id: v.patientId ?? null,
          p_reason: v.reason?.trim() || null,
        }),
      onSuccess: invalidate,
    }),
    decide: useMutation({
      mutationFn: (v: { grantId: string; approve: boolean; expiresAt?: string | null }) =>
        rpc('decide_patient_access', {
          p_grant_id: v.grantId,
          p_approve: v.approve,
          p_expires_at: v.expiresAt ?? null,
        }),
      onSuccess: invalidate,
    }),
    revoke: useMutation({
      mutationFn: (grantId: string) => rpc('revoke_patient_access', { p_grant_id: grantId }),
      onSuccess: invalidate,
    }),
    masterGrant: useMutation({
      mutationFn: (v: { ownerId: string; granteeId: string; patientId?: string | null; expiresAt?: string | null; reason?: string }) =>
        rpc('master_grant_patient_access', {
          p_owner_nutritionist_id: v.ownerId,
          p_grantee_id: v.granteeId,
          p_patient_id: v.patientId ?? null,
          p_expires_at: v.expiresAt ?? null,
          p_reason: v.reason?.trim() || null,
        }),
      onSuccess: invalidate,
    }),
    masterReassign: useMutation({
      mutationFn: (v: { patientId: string; newNutritionistId: string }) =>
        rpc('master_reassign_patient', { p_patient_id: v.patientId, p_new_nutritionist_id: v.newNutritionistId }),
      onSuccess: invalidate,
    }),
  };
}
