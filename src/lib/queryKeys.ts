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
    /** Hoje + próximos dias, a partir do início do dia `day` (YYYY-MM-DD). */
    agenda: (clinicId: string, day: string) => ['appointments', 'agenda', clinicId, day] as const,
    byMonth: (clinicId: string, monthKey: string) =>
      ['appointments', 'month', clinicId, monthKey] as const,
    byPatient: (patientId: string) => ['appointments', 'patient', patientId] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    actions: (clinicId: string, userId: string, clinical: boolean) =>
      ['dashboard', 'actions', clinicId, userId, clinical] as const,
    setup: (clinicId: string) => ['dashboard', 'setup', clinicId] as const,
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
  clinicProfessionals: (clinicId: string) => ['clinic', 'professionals', clinicId] as const,
  accessGrants: {
    all: ['access_grants'] as const,
    mine: ['access_grants', 'mine'] as const,
    requestable: ['access_grants', 'requestable'] as const,
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
  portal: {
    all: ['portal'] as const,
    appointments: (patientId: string) => ['portal', 'appointments', patientId] as const,
    mealPlan: (patientId: string) => ['portal', 'meal_plan', patientId] as const,
    requests: (patientId: string) => ['portal', 'requests', patientId] as const,
    health: (patientId: string) => ['portal', 'health', patientId] as const,
    slots: (patientId: string, from: string, to: string, appointmentId: string) =>
      ['portal', 'slots', patientId, from, to, appointmentId] as const,
    /** Convite pendente de um paciente (visão da equipe). */
    inviteStatus: (patientId: string) => ['portal', 'invite', patientId] as const,
  },
  availability: {
    all: ['availability'] as const,
    byNutritionist: (nutritionistId: string) => ['availability', nutritionistId] as const,
    staffSlots: (nutritionistId: string, from: string, to: string, minutes: number, excludeAppointment: string, excludeRequest: string) =>
      ['availability', 'slots', nutritionistId, from, to, minutes, excludeAppointment, excludeRequest] as const,
  },
  changeRequests: {
    all: ['change_requests'] as const,
    pending: (clinicId: string) => ['change_requests', 'pending', clinicId] as const,
  },
  finance: {
    all: ['finance'] as const,
    payments: (clinicId: string, monthKey: string) => ['finance', 'payments', clinicId, monthKey] as const,
    overdue: (clinicId: string, today: string) => ['finance', 'overdue', clinicId, today] as const,
    expenses: (clinicId: string, monthKey: string) => ['finance', 'expenses', clinicId, monthKey] as const,
    history: (clinicId: string, monthKey: string) => ['finance', 'history', clinicId, monthKey] as const,
    byAppointment: (appointmentId: string) => ['finance', 'appointment', appointmentId] as const,
  },
} as const;

/** Chave de mês estável para caching (ex.: "2026-09"). */
export const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
