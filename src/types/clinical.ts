/**
 * Tipos de domínio clínico (Onda 6 / DEBT-06).
 *
 * O client Supabase ainda não é genérico sobre `Database` — as queries com
 * joins retornam formas frouxas em runtime. Estes tipos descrevem a forma
 * *usada pela UI* (best-effort) e substituem os `any` espalhados pelas telas
 * de Exames / Consultas / Acompanhamento. Campos opcionais refletem que o
 * JSONB `ai_feedback` é gerado pela IA e nem sempre traz tudo.
 */
import type { ExamBiomarker } from '../lib/gemini';
import type { Database } from '../lib/database.types';

export type { ExamBiomarker };

/** Linhas completas do schema gerado — usar quando o select é `*`. */
export type PatientRow = Database['public']['Tables']['patients']['Row'];
export type ServiceRow = Database['public']['Tables']['services']['Row'];

/** Conteúdo do JSONB `patient_exams.ai_feedback`. */
export interface AiFeedback {
  alertas?: ExamBiomarker[];
  insights?: string;
  todos_biomarcadores?: ExamBiomarker[];
  analise_preditiva?: string;
  focos_sugeridos?: string[];
  tempo_estimado?: number;
  base_weeks?: number;
}

export interface PatientLite {
  id: string;
  name: string;
  status?: string | null;
  main_goal?: string | null;
}

/** Subset de `patients` retornado pelo join de `useNutritionistPatients`. */
export type PatientPickFromAppointments = Pick<
  PatientRow,
  'id' | 'name' | 'email' | 'phone' | 'birth_date' | 'biological_sex' | 'main_goal' | 'status'
>;

export interface ExamRecord {
  id: string;
  patient_id?: string;
  exam_date?: string | null;
  created_at: string;
  file_url: string;
  ai_feedback?: AiFeedback | null;
}

export interface AnthropometryJson {
  weight?: string | number | null;
  height?: string | number | null;
  body_fat?: string | number | null;
  muscle_mass?: string | number | null;
}

/** Vínculo mínimo de agendamento embutido numa consulta. */
export interface AppointmentLink {
  status?: string | null;
}

export interface ConsultationRecord {
  id: string;
  created_at: string;
  anamnese_notes?: string | null;
  anthropometry_json?: AnthropometryJson | null;
  appointments?: AppointmentLink | AppointmentLink[] | null;
}

/** Consulta embutida num agendamento (subset — sem `created_at`). */
export interface ConsultationLink {
  id?: string;
  anamnese_notes?: string | null;
  anthropometry_json?: AnthropometryJson | null;
}

export interface MealPlanRecord {
  id: string;
  created_at: string;
  kcal: number;
  meals?: Record<string, unknown> | null;
}

export interface ServiceLink {
  name?: string | null;
  modality?: string | null;
}

/** Serviço com os campos que a tela de Consultas seleciona no join. */
export interface ServiceLite {
  id?: string;
  name?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
}

/**
 * `patients` embutido no agendamento aberto em Consultas — o select traz a
 * ficha clínica quase completa, mas não todas as colunas de `PatientRow`.
 */
export type ConsultationPatient = Partial<PatientRow> & Pick<PatientRow, 'id' | 'name'>;

/** Agendamento selecionado na tela de Consultas (com o join rico de paciente). */
export interface ConsultationAppointment {
  id: string;
  date_time: string;
  status: string;
  clinic_id?: string | null;
  patient_id?: string | null;
  nutritionist_id?: string | null;
  service_id?: string | null;
  patients?: ConsultationPatient | null;
  services?: ServiceLite | null;
}

/** Linha do histórico clínico do paciente (fetchPatientHistory). */
export interface PastConsultation {
  id: string;
  anamnese_notes?: string | null;
  anthropometry_json?: AnthropometryJson | null;
  created_at: string;
  appointment_id?: string | null;
  appointments?:
    | { status?: string | null; date_time?: string | null; services?: ServiceLink | ServiceLink[] | null }
    | null;
}

/** Profissional da clínica (linha achatada de clinic_members + profiles). */
export interface ClinicProfessional {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  role?: string | null;
}

export interface AppointmentRecord {
  id: string;
  date_time: string;
  status: string;
  nutritionist_id?: string | null;
  services?: ServiceLink | ServiceLink[] | null;
  consultations?: ConsultationLink | ConsultationLink[] | null;
  patients?: { name?: string | null; main_goal?: string | null } | null;
}

/** Normaliza um join que pode vir como objeto único ou array (PostgREST). */
export function pickOne<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

// --- Recharts -------------------------------------------------------------

export interface RechartsTooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

export interface RechartsTooltipProps {
  active?: boolean;
  payload?: RechartsTooltipEntry[];
  label?: string | number;
}
