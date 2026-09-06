import { supabase } from './supabase';
import { logger } from '../lib/logger';

/**
 * Utilitários de Storage (Onda 5 / DEBT-02).
 *
 * Centraliza signed URLs / upload / remoção de exames e avatares — antes
 * repetidos em Exams, Consultations, MealPlans, Tracking e Onboarding, cada um
 * com o mesmo `bucket_id` mágico e a mesma convenção de path
 * (`<patientId>/<arquivo>` — de que dependem as policies de Storage da 0015).
 */

export const EXAMS_BUCKET = 'exams-bucket';
export const AVATARS_BUCKET = 'avatars';

const SIGNED_URL_TTL = 60 * 60; // 1 h

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** URL assinada temporária para o arquivo de um exame. Lança em erro. */
export async function createExamSignedUrl(path: string, expiresIn = SIGNED_URL_TTL): Promise<string> {
  const { data, error } = await supabase.storage.from(EXAMS_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('URL assinada não gerada.');
  return data.signedUrl;
}

/** Faz upload de um PDF de exame no path `<patientId>/<timestamp>_<nome>`. */
export async function uploadExamFile(patientId: string, file: File): Promise<{ path: string }> {
  const path = `${patientId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from(EXAMS_BUCKET).upload(path, file);
  if (error) throw error;
  return { path };
}

/** Remove o arquivo de um exame do bucket (best-effort; não lança). */
export async function removeExamFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(EXAMS_BUCKET).remove([path]);
  if (error) logger.warn('Falha ao remover arquivo de exame do storage:', error.message);
}

/** Sobe um avatar e devolve a URL pública. Nome com `crypto.randomUUID()` (SEC-15). */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file);
  if (error) throw error;
  return supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
}
