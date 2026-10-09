import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { PerimeterKey } from '../../lib/bodyComposition';

/**
 * Avaliação corporal (migration 0034): o nutricionista pede, o paciente envia
 * medidas/fotos pelo portal, a IA estima (só a pedido do nutricionista) e o
 * nutricionista valida.
 */

export type BodyKind = 'fita' | 'fotos' | 'completa';
export type BodyStatus = 'solicitada' | 'enviada' | 'validada' | 'cancelada';
export type Pose = 'front' | 'side' | 'back';
export const POSES: { key: Pose; label: string; how: string }[] = [
  { key: 'front', label: 'Frente', how: 'De frente, braços levemente afastados do corpo, pés na largura do quadril.' },
  { key: 'side', label: 'Lado', how: 'De lado (perfil direito), braços ao longo do corpo, olhando para a frente.' },
  { key: 'back', label: 'Costas', how: 'De costas, mesma posição da foto de frente.' },
];

export const KIND_LABEL: Record<BodyKind, string> = {
  fita: 'Medidas com fita',
  fotos: 'Fotos',
  completa: 'Medidas com fita + fotos',
};

type Measures = { [K in PerimeterKey]: number | null };

export interface AiEstimate {
  photo_quality_ok: boolean;
  photo_issues: string[];
  confidence: 'baixa' | 'media' | 'alta';
  estimated: Partial<Measures> & { body_fat_pct?: number | null };
  body_shape?: string | null;
  comparison?: string | null;
  observations: string;
  model?: string;
  compared_with?: string | null;
}

export interface BodyAssessment extends Measures {
  id: string;
  patient_id: string;
  clinic_id: string;
  kind: BodyKind;
  source: 'portal' | 'consultorio';
  status: BodyStatus;
  request_note: string | null;
  assessed_at: string | null;
  created_at: string;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  body_fat_source: 'rfm' | 'ia' | 'informado' | null;
  photo_paths: Partial<Record<Pose, string>>;
  ai_estimate: AiEstimate | null;
  ai_analyzed_at: string | null;
  nutritionist_note: string | null;
  shared_with_patient: boolean;
  validated_at: string | null;
}

const KEY = (patientId: string) => ['body_assessments', patientId] as const;

// numeric do Postgres chega como string pelo PostgREST.
const NUMERIC = ['height_cm', 'weight_kg', 'arm_cm', 'forearm_cm', 'waist_cm', 'hip_cm', 'thigh_cm', 'calf_cm', 'body_fat_pct'] as const;
function normalize<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of NUMERIC) if (out[k] != null) out[k] = Number(out[k]);
  return out as T;
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

export function useBodyAssessments(patientId: string | undefined) {
  return useQuery({
    queryKey: KEY(patientId ?? 'none'),
    enabled: !!patientId,
    queryFn: async (): Promise<BodyAssessment[]> => {
      const { data, error } = await supabase
        .from('body_assessments')
        .select('*')
        .eq('patient_id', patientId!)
        .neq('status', 'cancelada')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => normalize(r)) as BodyAssessment[];
    },
  });
}

/** URLs assinadas (1h) das fotos de uma avaliação. */
export function useBodyPhotoUrls(paths: Partial<Record<Pose, string>> | undefined) {
  const list = Object.entries(paths ?? {}).filter(([, p]) => !!p) as [Pose, string][];
  return useQuery({
    queryKey: ['body_photos', ...list.map(([, p]) => p)],
    enabled: list.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Partial<Record<Pose, string>>> => {
      const { data, error } = await supabase.storage.from('body-photos').createSignedUrls(list.map(([, p]) => p), 3600);
      if (error) throw error;
      const out: Partial<Record<Pose, string>> = {};
      list.forEach(([pose], i) => {
        if (data?.[i]?.signedUrl) out[pose] = data[i].signedUrl;
      });
      return out;
    },
  });
}

export function useBodyAssessmentMutations(patientId: string) {
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: KEY(patientId) });

  const request = useMutation({
    mutationFn: async (input: { kind: BodyKind; note?: string }) => {
      const { error } = await supabase.rpc('request_body_assessment', {
        p_patient_id: patientId,
        p_kind: input.kind,
        p_note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('body_assessments').update({ status: 'cancelada' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Registro feito no consultório (já validado). */
  const createInOffice = useMutation({
    mutationFn: async (input: { clinicId: string } & Partial<BodyAssessment>) => {
      const { clinicId, ...values } = input;
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase.from('body_assessments').insert({
        ...values,
        clinic_id: clinicId,
        patient_id: patientId,
        nutritionist_id: me.user?.id,
        kind: 'fita',
        source: 'consultorio',
        status: 'validada',
        assessed_at: new Date().toISOString(),
        validated_at: new Date().toISOString(),
        validated_by: me.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Salva os valores revisados e valida (ou só salva o rascunho). */
  const save = useMutation({
    mutationFn: async (input: { id: string; validate: boolean } & Partial<BodyAssessment>) => {
      const { id, validate, ...values } = input;
      const { data: me } = await supabase.auth.getUser();
      const { error } = await supabase.from('body_assessments').update({
        ...values,
        ...(validate ? { status: 'validada', validated_at: new Date().toISOString(), validated_by: me.user?.id } : {}),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const analyze = useMutation({
    mutationFn: async (assessmentId: string): Promise<AiEstimate> => {
      const { data, error } = await supabase.functions.invoke('body-assessment-ai', { body: { assessment_id: assessmentId } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let message = 'Não foi possível analisar as fotos.';
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
      return (data as { estimate: AiEstimate }).estimate;
    },
    onSuccess: invalidate,
  });

  const removePhotos = useMutation({
    mutationFn: async (a: BodyAssessment) => {
      const paths = Object.values(a.photo_paths ?? {}).filter(Boolean) as string[];
      if (paths.length) {
        const { error } = await supabase.storage.from('body-photos').remove(paths);
        if (error) throw error;
      }
      const { error } = await supabase.from('body_assessments').update({ photo_paths: {} }).eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { request, cancel, createInOffice, save, analyze, removePhotos };
}

// ---------------------------------------------------------------------------
// Paciente (portal)
// ---------------------------------------------------------------------------

export interface PortalBodyAssessment extends Measures {
  id: string;
  kind: BodyKind;
  status: 'solicitada' | 'enviada' | 'validada';
  request_note: string | null;
  created_at: string;
  assessed_at: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  nutritionist_note: string | null;
  suggested_height_cm: number | null;
}

export function usePortalBodyAssessments(patientId: string | undefined) {
  return useQuery({
    queryKey: ['portal', 'body', patientId ?? 'none'],
    enabled: !!patientId,
    queryFn: async (): Promise<PortalBodyAssessment[]> => {
      const { data, error } = await supabase.rpc('portal_body_assessments');
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const n = normalize(r);
        if (n.suggested_height_cm != null) n.suggested_height_cm = Number(n.suggested_height_cm);
        return n;
      }) as unknown as PortalBodyAssessment[];
    },
  });
}

export function usePortalSubmitBody(patientId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      assessmentId: string;
      heightCm: number;
      weightKg: number;
      measures: Partial<Measures>;
      photos: Partial<Record<Pose, Blob>>;
    }) => {
      const paths: Partial<Record<Pose, string>> = {};
      for (const [pose, blob] of Object.entries(input.photos) as [Pose, Blob][]) {
        const path = `${patientId}/${input.assessmentId}/${pose}-${Date.now()}.jpg`;
        const { error } = await supabase.storage.from('body-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error('Não foi possível enviar as fotos. Confira a conexão e tente de novo.');
        paths[pose] = path;
      }
      const m = input.measures;
      const { error } = await supabase.rpc('portal_submit_body_assessment', {
        p_id: input.assessmentId,
        p_height_cm: input.heightCm,
        p_weight_kg: input.weightKg,
        p_arm_cm: m.arm_cm ?? null,
        p_forearm_cm: m.forearm_cm ?? null,
        p_waist_cm: m.waist_cm ?? null,
        p_hip_cm: m.hip_cm ?? null,
        p_thigh_cm: m.thigh_cm ?? null,
        p_calf_cm: m.calf_cm ?? null,
        p_photo_paths: paths,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['portal', 'body', patientId ?? 'none'] }),
  });
}
