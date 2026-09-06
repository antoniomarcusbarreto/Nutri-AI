/**
 * Fábrica central de query keys (Onda 4 / PERF-03).
 *
 * Toda leitura do Supabase passa a ter uma key canônica aqui — assim vários
 * módulos que pedem "os exames do paciente X" compartilham a MESMA entrada de
 * cache, eliminando refetch redundante entre telas.
 *
 * Convenção: `[dominio, escopo, ...params]`. Sempre derivar as mais específicas
 * das mais genéricas para permitir invalidação em cascata
 * (`invalidateQueries({ queryKey: qk.patients.all })`).
 */
export const qk = {
  clinic: {
    stats: (clinicId: string, monthKey: string) =>
      ['clinic', 'stats', clinicId, monthKey] as const,
  },
  appointments: {
    all: ['appointments'] as const,
    upcoming: (clinicId: string) => ['appointments', 'upcoming', clinicId] as const,
    byMonth: (clinicId: string, monthKey: string) =>
      ['appointments', 'month', clinicId, monthKey] as const,
    byPatient: (patientId: string) => ['appointments', 'patient', patientId] as const,
  },
  reminders: {
    all: ['reminders'] as const,
    byMonth: (clinicId: string, monthKey: string) =>
      ['reminders', 'month', clinicId, monthKey] as const,
  },
  patients: {
    all: ['patients'] as const,
    list: (clinicId: string) => ['patients', 'list', clinicId] as const,
    byNutritionist: (nutritionistId: string) => ['patients', 'nutritionist', nutritionistId] as const,
    detail: (patientId: string) => ['patients', 'detail', patientId] as const,
  },
  patientExams: {
    byPatient: (patientId: string) => ['patient_exams', patientId] as const,
  },
  consultations: {
    byPatient: (patientId: string) => ['consultations', patientId] as const,
  },
  mealPlans: {
    byPatient: (patientId: string) => ['meal_plans', patientId] as const,
  },
} as const;

/** Chave de mês estável para caching (ex.: "2026-09"). */
export const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
