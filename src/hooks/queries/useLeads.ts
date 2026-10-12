import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { qk } from '../../lib/queryKeys';
import type { Lead, LeadStatus, LeadTriage } from '../../lib/leads';

/**
 * Triagem de novos pacientes (migration 0042 + edge function lead-triage).
 * O RLS só entrega ao nutricionista os leads do próprio link.
 */

const errorFromInvoke = async (error: unknown, fallback: string) => {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.status === 'number') {
    try {
      const body = await ctx.clone().json();
      if (body?.error) return new Error(body.error);
    } catch {
      // corpo não-JSON
    }
  }
  return new Error(fallback);
};

async function fetchLeads(userId: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*, matched_patient_id:lead_patient_match')
    .eq('nutritionist_id', userId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Lead[];
}

export function useLeads(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.leads.list(userId ?? 'none'),
    enabled: !!userId && enabled,
    queryFn: () => fetchLeads(userId!),
  });
}

/** Quantidade de leads novos (badge do menu). Compartilha o cache da lista. */
export function useNewLeadsCount(userId: string | undefined, enabled: boolean) {
  const { data } = useLeads(userId, enabled);
  return (data ?? []).filter((l) => l.status === 'novo').length;
}

export interface LeadForm { slug: string; enabled: boolean }

export function useLeadForm(userId: string | undefined) {
  return useQuery({
    queryKey: qk.leads.form(userId ?? 'none'),
    enabled: !!userId,
    queryFn: async (): Promise<LeadForm | null> => {
      const { data, error } = await supabase
        .from('lead_forms')
        .select('slug, enabled')
        .eq('nutritionist_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as LeadForm | null;
    },
  });
}

export function useSaveLeadForm(userId: string | undefined, clinicId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: LeadForm) => {
      const { error } = await supabase.from('lead_forms').upsert({
        nutritionist_id: userId!,
        clinic_id: clinicId!,
        slug: form.slug,
        enabled: form.enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'nutritionist_id' });
      if (error) {
        if (error.code === '23505') throw new Error('Esse endereço já está em uso. Escolha outro.');
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.leads.form(userId ?? 'none') }),
  });
}

export interface PatientHistory {
  name: string;
  status: string;
  since: string;
  doneCount: number;
  lastVisit: string | null;
  nextVisit: string | null;
  hasPortal: boolean;
}

/** Resumo do paciente que já corresponde ao lead (o RLS vale). */
export function usePatientHistory(patientId: string | null) {
  return useQuery({
    queryKey: qk.leads.patientHistory(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<PatientHistory | null> => {
      const [patient, appts] = await Promise.all([
        supabase.from('patients').select('name, status, created_at, portal_access_until').eq('id', patientId!).maybeSingle(),
        supabase.from('appointments').select('date_time, status').eq('patient_id', patientId!)
          .order('date_time', { ascending: false }).limit(50),
      ]);
      if (patient.error) throw patient.error;
      if (appts.error) throw appts.error;
      if (!patient.data) return null;
      const now = new Date().toISOString();
      const rows = (appts.data ?? []) as { date_time: string; status: string }[];
      const done = rows.filter((a) => a.status === 'concluido');
      const next = rows
        .filter((a) => a.date_time >= now && a.status !== 'cancelado' && a.status !== 'nao_compareceu')
        .sort((a, b) => a.date_time.localeCompare(b.date_time))[0];
      const p = patient.data as { name: string; status: string; created_at: string; portal_access_until: string | null };
      return {
        name: p.name,
        status: p.status,
        since: p.created_at,
        doneCount: done.length,
        lastVisit: done[0]?.date_time ?? null,
        nextVisit: next?.date_time ?? null,
        hasPortal: !!p.portal_access_until && new Date(p.portal_access_until) > new Date(),
      };
    },
  });
}

export function useLeadMutations(userId: string | undefined) {
  const queryClient = useQueryClient();
  const listKey = qk.leads.list(userId ?? 'none');
  const patch = (id: string, changes: Partial<Lead>) =>
    queryClient.setQueryData<Lead[]>(listKey, (prev) => prev?.map((l) => (l.id === id ? { ...l, ...changes } : l)) ?? prev);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const now = new Date().toISOString();
      const { error } = await supabase.from('leads')
        .update({ status, handled_at: status === 'novo' ? null : now, updated_at: now })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => patch(v.id, { status: v.status }),
  });

  const accept = useMutation({
    mutationFn: async ({ id, patientId }: { id: string; patientId?: string | null }): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_lead', { p_lead_id: id, p_patient_id: patientId ?? null });
      if (error) throw new Error(error.message || 'Não foi possível aceitar o pedido.');
      return data as string;
    },
    onSuccess: (patientId, v) => {
      patch(v.id, { status: 'convertido', converted_patient_id: patientId, matched_patient_id: patientId });
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      queryClient.invalidateQueries({ queryKey: qk.dashboard.all });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => queryClient.setQueryData<Lead[]>(listKey, (prev) => prev?.filter((l) => l.id !== id) ?? prev),
  });

  const triage = useMutation({
    mutationFn: async (id: string): Promise<LeadTriage> => {
      const { data, error } = await supabase.functions.invoke('lead-triage', { body: { lead_id: id } });
      if (error) throw await errorFromInvoke(error, 'Não foi possível fazer a triagem agora.');
      return (data as { triage: LeadTriage }).triage;
    },
    onSuccess: (t, id) => patch(id, { ai_triage: t, ai_triaged_at: new Date().toISOString() }),
  });

  return { setStatus, accept, remove, triage };
}

// ---------------------------------------------------------------------------
// Formulário público (/n/:slug)
// ---------------------------------------------------------------------------

export interface PublicLeadForm {
  nutritionist_name: string;
  crn: string | null;
  avatar_url: string | null;
  clinic_name: string;
  clinic_city: string | null;
  clinic_state: string | null;
}

export function usePublicLeadForm(slug: string | undefined) {
  return useQuery({
    queryKey: qk.leads.publicForm(slug ?? 'none'),
    enabled: !!slug,
    retry: false,
    queryFn: async (): Promise<PublicLeadForm | null> => {
      const { data, error } = await supabase.rpc('get_lead_form_public', { p_slug: slug });
      if (error) throw error;
      return (data as PublicLeadForm | null) ?? null;
    },
  });
}

export function useSubmitLead(slug: string | undefined) {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.rpc('submit_lead', { p_slug: slug, p_data: payload });
      if (error) {
        if (error.code === '53400') throw new Error('Muitos envios seguidos. Aguarde alguns minutos e tente de novo.');
        if (error.code === '22023' || error.code === 'P0002') throw new Error(error.message);
        throw new Error('Não foi possível enviar agora. Tente de novo em instantes.');
      }
    },
  });
}
