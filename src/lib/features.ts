/**
 * Recursos por plano: ponto único do frontend. O espelho no banco é
 * `clinic_has_feature()` (migration 0043), que é quem vale de verdade nas
 * Edge Functions. Hoje tudo está liberado para todos os planos; para limitar
 * depois, troque a regra aqui e lá (ex.: `clinic.plan_level === 'pro'`).
 */
export type Feature = 'teleconsulta' | 'teleconsulta_transcricao';

export function hasFeature(clinic: { plan_level?: string | null } | null | undefined, feature: Feature): boolean {
  void feature;
  return Boolean(clinic);
}
