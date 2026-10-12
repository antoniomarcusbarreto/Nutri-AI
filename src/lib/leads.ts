/**
 * Triagem de novos pacientes (migration 0042). Opções do formulário público
 * e rótulos usados na tela de Triagem. Os valores batem com os CHECKs do banco.
 */

export type LeadStatus = 'novo' | 'em_contato' | 'convertido' | 'descartado';
export type LeadGoal = 'emagrecimento' | 'ganho_massa' | 'saude' | 'gestacao' | 'esporte' | 'comportamento' | 'outro';
export type LeadCondition = 'diabetes' | 'hipertensao' | 'colesterol' | 'tireoide' | 'sop' | 'renal' | 'gastro' | 'outra';
export type LeadSource = 'instagram' | 'facebook' | 'tiktok' | 'google' | 'indicacao' | 'outro';
export type LeadModality = 'presencial' | 'online' | 'tanto_faz';
export type LeadPregnancy = 'nao' | 'gestante' | 'amamentando';
export type LeadPeriod = 'manha' | 'tarde' | 'noite';

export const GOALS: { value: LeadGoal; label: string }[] = [
  { value: 'emagrecimento', label: 'Emagrecimento' },
  { value: 'ganho_massa', label: 'Ganho de massa muscular' },
  { value: 'saude', label: 'Saúde e exames alterados' },
  { value: 'gestacao', label: 'Gestação ou amamentação' },
  { value: 'esporte', label: 'Performance esportiva' },
  { value: 'comportamento', label: 'Relação com a comida' },
  { value: 'outro', label: 'Outro' },
];

export const CONDITIONS: { value: LeadCondition; label: string }[] = [
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'hipertensao', label: 'Pressão alta' },
  { value: 'colesterol', label: 'Colesterol ou triglicerídeos' },
  { value: 'tireoide', label: 'Tireoide' },
  { value: 'sop', label: 'SOP' },
  { value: 'renal', label: 'Doença renal' },
  { value: 'gastro', label: 'Gastrite, refluxo ou intestino' },
  { value: 'outra', label: 'Outra' },
];

export const SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'indicacao', label: 'Indicação' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'outro', label: 'Outro' },
];

export const MODALITIES: { value: LeadModality; label: string }[] = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online', label: 'Online' },
  { value: 'tanto_faz', label: 'Tanto faz' },
];

export const PERIODS: { value: LeadPeriod; label: string }[] = [
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
];

/** 0 = domingo … 6 = sábado (Date.getDay). */
export const WEEKDAYS: { value: number; short: string }[] = [
  { value: 1, short: 'Seg' },
  { value: 2, short: 'Ter' },
  { value: 3, short: 'Qua' },
  { value: 4, short: 'Qui' },
  { value: 5, short: 'Sex' },
  { value: 6, short: 'Sáb' },
];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  convertido: 'Virou paciente',
  descartado: 'Descartado',
};

export const LEAD_STATUS_STYLE: Record<Lead['status'], string> = {
  novo: 'bg-amber-50 text-amber-700 border-amber-100',
  em_contato: 'bg-blue-50 text-blue-700 border-blue-100',
  convertido: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  descartado: 'bg-slate-100 text-slate-500 border-slate-200',
};

/** Selos determinísticos (não dependem da IA). */
export function leadFlags(lead: Lead, now = new Date()) {
  const flags: { label: string; className: string }[] = [];
  flags.push(lead.matched_patient_id
    ? { label: 'Já é paciente', className: 'bg-teal-50 text-teal-700 border-teal-100' }
    : { label: 'Paciente novo', className: 'bg-slate-50 text-slate-600 border-slate-200' });
  const age = ageFrom(lead.birth_date, now);
  if (age !== null && age < 18) flags.push({ label: 'Menor de idade', className: 'bg-rose-50 text-rose-700 border-rose-100' });
  if (lead.pregnancy === 'gestante') flags.push({ label: 'Gestante', className: 'bg-rose-50 text-rose-700 border-rose-100' });
  if (lead.pregnancy === 'amamentando') flags.push({ label: 'Amamentando', className: 'bg-amber-50 text-amber-700 border-amber-100' });
  return flags;
}

const labelOf = <T extends string>(list: { value: T; label: string }[], v: T | null | undefined) =>
  list.find((o) => o.value === v)?.label ?? null;

export const goalLabel = (v: LeadGoal | null | undefined) => labelOf(GOALS, v);
export const sourceLabel = (v: LeadSource | null | undefined) => labelOf(SOURCES, v);
export const modalityLabel = (v: LeadModality | null | undefined) => labelOf(MODALITIES, v);
export const conditionLabel = (v: LeadCondition) => labelOf(CONDITIONS, v) ?? v;
export const periodLabel = (v: LeadPeriod) => labelOf(PERIODS, v) ?? v;
export const weekdayShort = (d: number) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d] ?? String(d);

export function ageFrom(birth: string | null | undefined, now = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** "nutri ana-souza" → "nutri-ana-souza" (mesmo formato do CHECK de lead_forms.slug). */
export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export const isValidSlug = (s: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 3 && s.length <= 40;

/** Triagem da IA (edge function lead-triage), gravada em leads.ai_triage. */
export interface LeadTriage {
  resumo: string;
  prioridade: 'alta' | 'media' | 'baixa';
  prioridade_motivo: string;
  pontos_atencao: { titulo: string; detalhe: string; tipo: 'cuidado' | 'encaminhamento' | 'info' }[];
  servico_sugerido_id: string | null;
  servico_motivo: string | null;
  perguntas_consulta: string[];
  mensagem_whatsapp: string;
  model?: string;
}

export interface Lead {
  id: string;
  clinic_id: string;
  nutritionist_id: string;
  status: LeadStatus;
  name: string;
  phone: string;
  email: string | null;
  birth_date: string | null;
  biological_sex: 'F' | 'M' | null;
  modality: LeadModality | null;
  city: string | null;
  goal: LeadGoal;
  goal_details: string | null;
  deadline: string | null;
  had_nutritionist: boolean | null;
  conditions: LeadCondition[];
  medications: string | null;
  pregnancy: LeadPregnancy | null;
  allergies: string | null;
  restrictions: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  health_notes: string | null;
  preferred_days: number[];
  preferred_periods: LeadPeriod[];
  source: LeadSource | null;
  source_detail: string | null;
  consent_whatsapp: boolean;
  ai_triage: LeadTriage | null;
  ai_triaged_at: string | null;
  converted_patient_id: string | null;
  created_at: string;
  updated_at: string;
  /** Campo calculado (lead_patient_match): paciente que já corresponde ao lead. */
  matched_patient_id: string | null;
}

export function whatsappLink(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '');
  const target = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${target}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
