import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, ShieldAlert, Users } from 'lucide-react';
import { usePatients } from '../hooks/queries/usePatients';
import { usePatientExams } from '../hooks/queries/usePatientExams';
import { useConsultations, useMealPlans, usePatientAppointments } from '../hooks/queries/usePatientHistory';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type {
  AppointmentRecord,
  ConsultationRecord,
  ExamRecord,
  MealPlanRecord,
  PatientRow,
} from '../types/clinical';
import { pickOne } from '../types/clinical';
import { EmptyState, PageHeader } from '../components/ui';
import { PatientPicker } from '../components/tracking/PatientPicker';
import { PatientSummary } from '../components/tracking/PatientSummary';
import { PeriodBar } from '../components/tracking/PeriodBar';
import { CompositionSection } from '../components/tracking/CompositionSection';
import { BiomarkersSection } from '../components/tracking/BiomarkersSection';
import { PredictionCard } from '../components/tracking/PredictionCard';
import { JourneyTimeline } from '../components/tracking/JourneyTimeline';
import { AppointmentDetailModal, ExamDetailModal, MealPlanDetailModal } from '../components/tracking/TrackingModals';
import {
  ageFromBirthDate,
  buildBiomarkerSeries,
  buildBodySeries,
  buildJourney,
  computeFlowStats,
  examDate,
  inRange,
  isUpcoming,
  parsePeriod,
  periodLabel,
  periodRange,
  serializePeriod,
  type JourneyEvent,
  type Period,
} from '../components/tracking/trackingModel';

const EMPTY: never[] = [];
const STORAGE_KEY = 'nutri-ai:selected-patient-id';

const readStoredPatient = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * Acompanhamento: evolução do paciente (composição corporal, biomarcadores),
 * projeção da IA e linha do tempo de consultas/exames/planos.
 *
 * Paciente e período ficam na URL (`?paciente=…&periodo=6m`) — o "voltar" do
 * navegador funciona e dá para compartilhar/abrir direto uma visão.
 */
export const Tracking: React.FC = () => {
  const { clinic, userRole } = useAuth();
  const { showToast } = useToast();
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';
  const [searchParams, setSearchParams] = useSearchParams();
  // "Agora" fixo durante a visita: mantém o render puro e as derivações estáveis.
  const [now] = useState(() => new Date());

  const { data: allPatients = EMPTY as PatientRow[], isLoading: loadingPatients } =
    usePatients(clinic?.id, { enabled: isAuthorized });

  // Paciente: URL → último usado neste navegador → primeiro ativo.
  const urlPatientId = searchParams.get('paciente');
  const selectedPatientId = useMemo(() => {
    const exists = (id: string | null) => !!id && allPatients.some((p) => p.id === id);
    if (exists(urlPatientId)) return urlPatientId as string;
    const stored = readStoredPatient();
    if (exists(stored)) return stored as string;
    return allPatients.find((p) => p.status === 'ativo')?.id ?? '';
  }, [allPatients, urlPatientId]);
  const patient = allPatients.find((p) => p.id === selectedPatientId) ?? null;

  const periodParam = searchParams.get('periodo');
  const period = useMemo(() => parsePeriod(periodParam), [periodParam]);
  const periodKey = serializePeriod(period);
  const range = useMemo(() => periodRange(period, now), [period, now]);
  const periodText = periodLabel(period);

  const updateParam = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const selectPatient = (id: string) => updateParam('paciente', id);

  // Compartilha a seleção com Planos Alimentares (mesma chave), para os atalhos
  // do cabeçalho abrirem já no paciente em foco.
  useEffect(() => {
    if (!selectedPatientId) return;
    try { localStorage.setItem(STORAGE_KEY, selectedPatientId); } catch { /* armazenamento indisponível */ }
  }, [selectedPatientId]);
  const setPeriod = (p: Period) => updateParam('periodo', serializePeriod(p));

  // Histórico do paciente — as 4 queries disparam em paralelo.
  const consultationsQuery = useConsultations(selectedPatientId || undefined);
  const examsQuery = usePatientExams(selectedPatientId || undefined);
  const mealPlansQuery = useMealPlans(selectedPatientId || undefined);
  const appointmentsQuery = usePatientAppointments(selectedPatientId || undefined);

  // Só consultas de atendimentos concluídos (exclui rascunhos em andamento).
  const consultations = useMemo(
    () => ((consultationsQuery.data ?? EMPTY) as ConsultationRecord[]).filter(
      (c) => pickOne(c.appointments)?.status === 'concluido',
    ),
    [consultationsQuery.data],
  );
  const exams: ExamRecord[] = examsQuery.data ?? EMPTY;
  const mealPlans: MealPlanRecord[] = mealPlansQuery.data ?? EMPTY;
  const appointments: AppointmentRecord[] = (appointmentsQuery.data ?? EMPTY) as AppointmentRecord[];
  const loadingHistory = !!selectedPatientId && (
    consultationsQuery.isLoading || examsQuery.isLoading || mealPlansQuery.isLoading || appointmentsQuery.isLoading
  );

  useEffect(() => {
    if (consultationsQuery.error || examsQuery.error || mealPlansQuery.error || appointmentsQuery.error) {
      showToast('Erro ao carregar histórico do paciente.', 'error');
    }
  }, [consultationsQuery.error, examsQuery.error, mealPlansQuery.error, appointmentsQuery.error, showToast]);

  // --- Derivações ------------------------------------------------------------
  const bodySeries = useMemo(() => buildBodySeries(consultations), [consultations]);
  const bodyInPeriod = useMemo(() => bodySeries.filter((p) => inRange(p.date, range)), [bodySeries, range]);
  const plansInPeriod = useMemo(
    () => mealPlans.filter((p) => inRange(new Date(p.created_at), range)),
    [mealPlans, range],
  );
  const biomarkerSeries = useMemo(() => buildBiomarkerSeries(exams), [exams]);
  const journey = useMemo(() => buildJourney(appointments, exams, mealPlans, now), [appointments, exams, mealPlans, now]);
  const pastEvents = useMemo(() => journey.filter((e) => e.date <= now && inRange(e.date, range)), [journey, now, range]);
  const upcoming = useMemo(
    () => appointments
      .filter((a) => isUpcoming(a, now))
      .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime()),
    [appointments, now],
  );
  const stats = useMemo(() => computeFlowStats(appointments, range, now), [appointments, range, now]);

  const latestExam = useMemo(
    () => exams.reduce<ExamRecord | null>((a, e) => (!a || examDate(e) > examDate(a) ? e : a), null),
    [exams],
  );
  const latestPlan = mealPlans[0] ?? null; // query já vem em created_at desc

  const years = useMemo(() => {
    const set = new Set<number>([now.getFullYear()]);
    journey.forEach((e) => { if (!isNaN(e.date.getTime())) set.add(e.date.getFullYear()); });
    return [...set].sort((a, b) => b - a);
  }, [journey, now]);

  // --- Modais ----------------------------------------------------------------
  const [examForModal, setExamForModal] = useState<ExamRecord | null>(null);
  const [aptForModal, setAptForModal] = useState<AppointmentRecord | null>(null);
  const [planForModal, setPlanForModal] = useState<MealPlanRecord | null>(null);

  const openEvent = (evt: JourneyEvent) => {
    if (evt.kind === 'exam') setExamForModal(evt.exam);
    else if (evt.kind === 'mealplan') setPlanForModal(evt.plan);
    else setAptForModal(evt.appointment);
  };

  if (!isAuthorized) {
    return (
      <EmptyState
        className="mx-auto mt-12 max-w-lg"
        icon={<ShieldAlert />}
        title="Acesso restrito a profissionais"
        description="O acompanhamento clínico é restrito aos nutricionistas e responsáveis da clínica."
      />
    );
  }

  const hasHistory = exams.length + consultations.length + mealPlans.length + appointments.length > 0;

  return (
    <div className="flex flex-col gap-6 pb-12 text-left animate-in fade-in duration-500">
      <PageHeader
        title="Acompanhamento"
        description="Evolução corporal, exames e histórico de consultas do paciente."
        actions={
          <PatientPicker
            patients={allPatients}
            value={selectedPatientId}
            onChange={selectPatient}
            loading={loadingPatients}
          />
        }
      />

      {!loadingPatients && !patient ? (
        <EmptyState
          className="mx-auto max-w-xl"
          icon={<Users />}
          title={allPatients.length === 0 ? 'Nenhum paciente cadastrado' : 'Nenhum paciente selecionado'}
          description={allPatients.length === 0
            ? 'Cadastre pacientes em Pacientes para acompanhar a evolução deles aqui.'
            : 'Selecione um paciente no campo acima para ver a evolução, os exames e o histórico de consultas.'}
        />
      ) : loadingPatients || loadingHistory || !patient ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-500" role="status">
          <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-teal-600 border-t-transparent" />
          <p className="text-sm">Carregando histórico do paciente…</p>
        </div>
      ) : (
        <>
          <PatientSummary
            patient={patient}
            age={ageFromBirthDate(patient.birth_date, now)}
            stats={stats}
            latestPlan={latestPlan}
            latestExamDate={latestExam ? examDate(latestExam) : null}
            onOpenPlan={setPlanForModal}
          />

          {!hasHistory ? (
            <EmptyState
              className="mx-auto max-w-xl"
              icon={<ClipboardList />}
              title="Nenhum registro clínico ainda"
              description="Este paciente ainda não tem consultas, exames, planos alimentares nem agendamentos. Assim que houver o primeiro registro, a evolução aparece aqui."
            />
          ) : (
            <>
              <PeriodBar period={period} onChange={setPeriod} years={years} />
              <CompositionSection
                points={bodyInPeriod}
                history={bodySeries}
                plans={plansInPeriod}
                age={ageFromBirthDate(patient.birth_date, now)}
                periodText={periodText}
              />
              <BiomarkersSection
                key={selectedPatientId}
                series={biomarkerSeries}
                range={range}
                periodText={periodText}
                onOpenExam={(id) => setExamForModal(exams.find((e) => e.id === id) ?? null)}
              />
              <PredictionCard latestExam={latestExam} mealPlans={mealPlans} now={now} />
              <JourneyTimeline
                key={`${selectedPatientId}:${periodKey}`}
                events={pastEvents}
                upcoming={upcoming}
                stats={stats}
                periodText={periodText}
                onShowAll={() => setPeriod({ kind: 'all' })}
                onOpenAppointment={setAptForModal}
                onOpenEvent={openEvent}
              />
            </>
          )}
        </>
      )}

      <ExamDetailModal exam={examForModal} onClose={() => setExamForModal(null)} />
      <AppointmentDetailModal appointment={aptForModal} onClose={() => setAptForModal(null)} />
      <MealPlanDetailModal plan={planForModal} onClose={() => setPlanForModal(null)} />
    </div>
  );
};
