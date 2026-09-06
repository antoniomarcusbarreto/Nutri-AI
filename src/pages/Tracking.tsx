import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePatients } from '../hooks/queries/usePatients';
import { usePatientExams } from '../hooks/queries/usePatientExams';
import { useConsultations, useMealPlans, usePatientAppointments } from '../hooks/queries/usePatientHistory';
import { createExamSignedUrl } from '../lib/storage';
import {
  Activity,
  Sparkles,
  Calendar,
  ShieldAlert,
  FileText,
  ClipboardList,
  Eye,
  CalendarRange,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getCanonicalBiomarkerName } from '../utils/biomarkers';
import { logger } from '../lib/logger';
import type {
  AnthropometryJson,
  AppointmentRecord,
  ConsultationRecord,
  ExamBiomarker,
  ExamRecord,
  MealPlanRecord,
  PatientLite,
  RechartsTooltipProps,
} from '../types/clinical';
import { pickOne } from '../types/clinical';

// Helper to parse dates in local timezone (avoiding UTC offset conversion bugs)
const EMPTY: never[] = [];

/** Tooltip de biomarcadores — hoisted (react-hooks/static-components). */
const CustomBiomarkerTooltip: React.FC<
  RechartsTooltipProps & { resolveOriginal: (name: string, dateStr: string) => string | null }
> = ({ active, payload, label, resolveOriginal }) => {
  if (!active || !payload || !payload.length) return null;
  const labelStr = label != null ? String(label) : '';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-left min-w-[200px]">
      <p className="text-xs font-semibold text-slate-500 mb-2">{labelStr}</p>
      <div className="space-y-1.5">
        {payload.map((item, index) => {
          const originalVal = item.name ? resolveOriginal(item.name, labelStr) : null;
          const displayVal = originalVal || `${item.value}`;
          return (
            <div key={index} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-slate-600 font-medium">{item.name}:</span>
              <span className="text-slate-900 font-bold ml-auto">{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Tooltip de antropometria — hoisted (react-hooks/static-components). */
const CustomAnthropometryTooltip: React.FC<RechartsTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-md text-left min-w-[200px]">
      <p className="text-xs font-semibold text-slate-500 mb-2">{label != null ? String(label) : ''}</p>
      <div className="space-y-1.5">
        {payload.map((item, index) => {
          let unit = '';
          if (item.dataKey === 'weight') unit = ' kg';
          else if (item.dataKey === 'bodyFat' || item.dataKey === 'muscleMass') unit = '%';
          return (
            <div key={index} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-slate-650 font-medium">{item.name}:</span>
              <span className="text-slate-900 font-bold ml-auto">{item.value}{unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TimelineMeta {
  notes?: string | null;
  weight?: string | number | null;
  body_fat?: string | number | null;
  muscle_mass?: string | number | null;
  alertsCount?: number;
  insights?: string;
  exam?: ExamRecord;
  kcal?: number;
  mealsCount?: number;
}

interface TimelineEvent {
  id: string;
  type: 'consultation' | 'exam' | 'mealplan';
  date: Date;
  title: string;
  subtitle: string;
  meta: TimelineMeta;
}

const parseExamDate = (dateVal: string | null | undefined): Date => {
  if (!dateVal) return new Date();
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const [year, month, day] = dateVal.split('-').map(Number);
    // Creates a date at midnight in the local system/browser timezone (e.g. America/Sao_Paulo)
    return new Date(year, month - 1, day);
  }
  return new Date(dateVal);
};

export const Tracking: React.FC = () => {
  const { clinic, userRole } = useAuth();
  const { showToast } = useToast();

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  // Dados via TanStack Query (Onda 4 / PERF-06): as 4 queries de histórico
  // disparam EM PARALELO — não há mais o `loadPatientHistory` com 4 awaits.
  const { data: allPatients = [], isLoading: loadingPatients } = usePatients(clinic?.id, { enabled: isAuthorized });
  const patients = useMemo<PatientLite[]>(
    () => allPatients.filter((p: PatientLite) => p.status === 'ativo'),
    [allPatients],
  );

  const consultationsQuery = useConsultations(selectedPatientId);
  const examsQuery = usePatientExams(selectedPatientId);
  const mealPlansQuery = useMealPlans(selectedPatientId);
  const appointmentsQuery = usePatientAppointments(selectedPatientId);

  // Só as consultas de agendamentos efetivamente concluídos entram no histórico.
  const consultations = useMemo(
    () => ((consultationsQuery.data ?? []) as ConsultationRecord[]).filter((c) => {
      const status = pickOne(c.appointments)?.status;
      return status === 'concluido' || status === 'realizada';
    }),
    [consultationsQuery.data],
  );
  const exams: ExamRecord[] = examsQuery.data ?? EMPTY;
  const mealPlans: MealPlanRecord[] = mealPlansQuery.data ?? EMPTY;
  const appointments: AppointmentRecord[] = appointmentsQuery.data ?? EMPTY;
  const loadingContext = !!selectedPatientId && (
    consultationsQuery.isLoading || examsQuery.isLoading ||
    mealPlansQuery.isLoading || appointmentsQuery.isLoading
  );

  // Modal states for details
  const [selectedExamForModal, setSelectedExamForModal] = useState<ExamRecord | null>(null);
  const [selectedAptForModal, setSelectedAptForModal] = useState<AppointmentRecord | null>(null);
  // Signed URL do PDF do exame aberto no modal — via TanStack Query (sem
  // efeito com setState; Onda 4/6). `file_url` como chave garante refetch ao
  // trocar de exame e cache ao reabrir o mesmo.
  const modalFileUrl = selectedExamForModal?.file_url;
  const {
    data: modalPdfUrl = null,
    isFetching: loadingPdfUrl,
    error: modalPdfError,
  } = useQuery({
    queryKey: ['exam-signed-url', modalFileUrl],
    enabled: !!modalFileUrl,
    staleTime: 50 * 60 * 1000, // signed URL vale 1h
    queryFn: () => createExamSignedUrl(modalFileUrl as string),
  });

  // Visible chart line filters
  const [visibleBiomarkers, setVisibleBiomarkers] = useState<Record<string, boolean>>({});
  const [visibleAnthropometry, setVisibleAnthropometry] = useState<Record<string, boolean>>({
    weight: true,
    bodyFat: true,
    muscleMass: true
  });

  // Helper to find original biomarker value from exams data to display with unit in custom tooltip
  const getOriginalBiomarkerValue = (biomarkerName: string, dateStr: string): string | null => {
    const exam = exams.find(e => {
      const date = parseExamDate(e.exam_date || e.created_at);
      const formattedDate = format(date, 'MMM/yy', { locale: ptBR });
      return formattedDate === dateStr;
    });
    if (!exam) return null;
    const bio = exam.ai_feedback?.todos_biomarcadores?.find(
      (b) => getCanonicalBiomarkerName(b.marcador).toLowerCase() === biomarkerName.toLowerCase()
    );
    return bio ? bio.valor : null;
  };

  useEffect(() => {
    if (modalPdfError) {
      logger.error('Erro ao gerar URL assinada para modal:', modalPdfError);
      showToast('Não foi possível gerar link de acesso ao PDF.', 'error');
    }
  }, [modalPdfError, showToast]);

  // Seleção inicial de paciente (mantém a preferência em localStorage).
  useEffect(() => {
    if (selectedPatientId || patients.length === 0) return;
    const stored = localStorage.getItem('nutri-ai:selected-patient-id');
    const initialId = patients.some((p) => p.id === stored) ? (stored as string) : patients[0].id;
    // Bootstrap único: sincroniza a seleção com a lista assim que ela carrega.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPatientId(initialId);
    localStorage.setItem('nutri-ai:selected-patient-id', initialId);
  }, [patients, selectedPatientId]);

  // Erros de qualquer uma das 4 queries de histórico.
  useEffect(() => {
    if (consultationsQuery.error || examsQuery.error || mealPlansQuery.error || appointmentsQuery.error) {
      showToast('Erro ao carregar histórico do paciente.', 'error');
    }
  }, [consultationsQuery.error, examsQuery.error, mealPlansQuery.error, appointmentsQuery.error, showToast]);

  // 1. Dynamic AI Treatment Predictive Prognosis
  const prediction = useMemo(() => {
    if (!selectedPatientId) return null;

    const latestExam = exams.length > 0 ? exams[0] : null;
    const latestConsultation = consultations.length > 0 ? consultations[0] : null;
    
    // Check if there is a meal plan to activate treatment
    const hasMealPlan = mealPlans.length > 0;
    const isTreatmentActive = hasMealPlan;

    // Determine base weeks (AI can output base_weeks/tempo_estimado, or we fall back based on biomarkers)
    let baseWeeks = latestExam?.ai_feedback?.tempo_estimado || latestExam?.ai_feedback?.base_weeks;
    if (!baseWeeks) {
      const hasHashimoto = latestExam?.ai_feedback?.alertas?.some(
        (a) => a.marcador.toLowerCase().includes('anti-tpo') || a.marcador.toLowerCase().includes('tsh')
      ) || latestConsultation?.anamnese_notes?.toLowerCase().includes('hashimoto') || latestConsultation?.anamnese_notes?.toLowerCase().includes('tireoide');

      const hasHighGlucose = latestExam?.ai_feedback?.todos_biomarcadores?.some(
        (b) => b.marcador.toLowerCase().includes('glicose') && parseFloat(b.valor) > 99
      ) || latestConsultation?.anamnese_notes?.toLowerCase().includes('glicose');

      const hasLowVitD = latestExam?.ai_feedback?.todos_biomarcadores?.some(
        (b) => b.marcador.toLowerCase().includes('vitamina d') && parseFloat(b.valor) < 30
      );

      if (hasHashimoto) {
        baseWeeks = 16;
      } else if (hasHighGlucose) {
        baseWeeks = 8;
      } else if (hasLowVitD) {
        baseWeeks = 10;
      } else {
        baseWeeks = 12;
      }
    }

    // Dynamic prediction description (analise_preditiva) from the database
    let description = latestExam?.ai_feedback?.analise_preditiva;
    if (!description) {
      description = latestExam?.ai_feedback?.insights || "Adequação dietética e reeducação metabólica geral. Os exames laboratoriais demonstram biomarcadores séricos estáveis e o plano alimentar está calibrado para manutenção e suporte digestivo padrão de 12 semanas.";
    }

    // Adapt description text if there is no meal plan
    if (!hasMealPlan) {
      const originalDesc = description;
      description = description.replace(
        /\s*e o plano alimentar está calibrado para manutenção e suporte digestivo padrão de (\d+) semanas/gi,
        (_: string, weeks: string) => `; aguardando a estruturação do plano alimentar personalizado de ${weeks} semanas para início do suporte digestivo`
      ).replace(
        /\s*o plano alimentar está calibrado para manutenção e suporte digestivo padrão de (\d+) semanas/gi,
        (_: string, weeks: string) => `aguardando a estruturação do plano alimentar personalizado de ${weeks} semanas para início do suporte digestivo`
      ).replace(
        /\s*plano alimentar está calibrado para manutenção e suporte digestivo padrão/gi,
        "aguardando a estruturação do plano alimentar personalizado para início do suporte digestivo"
      ).replace(
        /\s*plano alimentar está calibrado/gi,
        "aguardando a estruturação do plano alimentar personalizado"
      );

      // If description hasn't changed or matches general fallback, replace completely to ensure zero hallucination
      if (originalDesc === description && (description.includes("está calibrado") || description.includes("calibrado"))) {
        description = `Adequação dietética e reeducação metabólica geral sugeridas. Os exames laboratoriais demonstram biomarcadores séricos ${(latestExam?.ai_feedback?.alertas?.length ?? 0) > 0 ? 'alterados' : 'estáveis'}; aguardando a estruturação do plano alimentar personalizado de ${baseWeeks} semanas para início do suporte digestivo.`;
      }
    }

    // Dynamic focus points (focos_sugeridos) from the database
    let focusPoints: string[] = latestExam?.ai_feedback?.focos_sugeridos ?? [];
    if (!focusPoints.length) {
      const hasHashimoto = latestExam?.ai_feedback?.alertas?.some(
        (a) => a.marcador.toLowerCase().includes('anti-tpo') || a.marcador.toLowerCase().includes('tsh')
      );
      const hasHighGlucose = latestExam?.ai_feedback?.todos_biomarcadores?.some(
        (b) => b.marcador.toLowerCase().includes('glicose') && parseFloat(b.valor) > 99
      );
      const hasLowVitD = latestExam?.ai_feedback?.todos_biomarcadores?.some(
        (b) => b.marcador.toLowerCase().includes('vitamina d') && parseFloat(b.valor) < 30
      );

      if (hasHashimoto) {
        focusPoints = ["Ajuste dietético livre de glúten e xenobióticos", "Suplementação funcional com Selênio, Zinco e L-Tirosina", "Acompanhamento da fadiga e da curva térmica do TSH"];
      } else if (hasHighGlucose) {
        focusPoints = ["Priorização de carboidratos complexos de baixo índice glicêmico", "Inclusão de aveia, chia e psyllium no diário alimentar", "Incentivo a treinos resistidos pós-prandiais"];
      } else if (hasLowVitD) {
        focusPoints = ["Suplementação oral ativa de Vitamina D3 com co-fatores (K2 + Magnésio)", "Consumo regular de gemas de ovos, peixes gordos e sementes", "Exposição solar de 15 minutos em horários de pico"];
      } else {
        focusPoints = ["Manutenção de aporte hídrico calibrado (35ml/kg)", "Ingestão variada de fitoquímicos (dieta arco-íris)", "Calibração e higiene do sono com chás relaxantes"];
      }
    }

    // Calculate elapsed weeks from the oldest/first meal plan's creation date to today
    let progressWeeks = 1;
    if (isTreatmentActive && mealPlans.length > 0) {
      const oldestPlan = mealPlans[mealPlans.length - 1];
      const oldestDateVal = new Date(oldestPlan.created_at);
      const today = new Date();
      
      const start = new Date(oldestDateVal.getFullYear(), oldestDateVal.getMonth(), oldestDateVal.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      progressWeeks = Math.floor(diffDays / 7) + 1;
    }

    // Limit to the ceiling of the plan (baseWeeks)
    progressWeeks = Math.min(progressWeeks, baseWeeks);

    return {
      baseWeeks,
      progressWeeks,
      description,
      focusPoints,
      isTreatmentActive,
      percent: Math.min(100, Math.round((progressWeeks / baseWeeks) * 100))
    };
  }, [selectedPatientId, exams, consultations, mealPlans]);

  // Helper to extract clean numerical values from biomarker strings (e.g. "86.6 mg/dL" -> 86.6)
  const parseBiomarkerValue = (valStr: string): number | null => {
    if (!valStr) return null;
    const cleaned = valStr.replace(',', '.');
    const match = cleaned.match(/[-+]?[0-9]*\.?[0-9]+/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? null : num;
    }
    return null;
  };

  // Identify all biomarkers analyzed by the AI for this patient (sorted by frequency)
  const allBiomarkers = useMemo(() => {
    const counts: Record<string, number> = {};
    exams.forEach(e => {
      e.ai_feedback?.todos_biomarcadores?.forEach((b) => {
        const name = getCanonicalBiomarkerName(b.marcador);
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
  }, [exams]);

  // Consolidate exams chronologically (oldest first) and extract biomarker values
  const biomarkerRechartsData = useMemo(() => {
    const sortedExams = [...exams].sort((a, b) => {
      const dateA = parseExamDate(a.exam_date || a.created_at);
      const dateB = parseExamDate(b.exam_date || b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    return sortedExams.map(e => {
      const date = parseExamDate(e.exam_date || e.created_at);
      const formattedDate = format(date, 'MMM/yy', { locale: ptBR });

      const row: Record<string, string | number | Date> = {
        dateStr: formattedDate,
        originalDate: date,
      };

      e.ai_feedback?.todos_biomarcadores?.forEach((b) => {
        const name = getCanonicalBiomarkerName(b.marcador);
        const val = parseBiomarkerValue(b.valor);
        if (val !== null) {
          row[name] = val;
        }
      });

      return row;
    });
  }, [exams]);

  // Consolidate physical body evaluations chronologically (oldest first)
  const anthropometryRechartsData = useMemo(() => {
    const sortedConsultations = [...consultations].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA.getTime() - dateB.getTime();
    });

    return sortedConsultations
      .map(c => {
        const date = new Date(c.created_at);
        const formattedDate = format(date, 'MMM/yy', { locale: ptBR });
        
        const weight = parseFloat(String(c.anthropometry_json?.weight ?? ''));
        const bodyFat = parseFloat(String(c.anthropometry_json?.body_fat ?? ''));
        const muscleMass = parseFloat(String(c.anthropometry_json?.muscle_mass ?? ''));

        return {
          dateStr: formattedDate,
          originalDate: date,
          weight: isNaN(weight) ? null : weight,
          bodyFat: isNaN(bodyFat) ? null : bodyFat,
          muscleMass: isNaN(muscleMass) ? null : muscleMass,
        };
      })
      .filter(d => d.weight !== null || d.bodyFat !== null || d.muscleMass !== null);
  }, [consultations]);

  // 5. Patient Journey Timeline Events compiler (reverse chronological)
  const timelineEvents = useMemo(() => {
    if (!selectedPatientId) return [];

    const events: TimelineEvent[] = [];

    consultations.forEach(c => {
      events.push({
        id: `c_${c.id}`,
        type: 'consultation',
        date: new Date(c.created_at),
        title: 'Consulta Clínico-Nutricional',
        subtitle: `Anamnese cadastrada & dados antropométricos aferidos`,
        meta: {
          notes: c.anamnese_notes,
          weight: c.anthropometry_json?.weight,
          body_fat: c.anthropometry_json?.body_fat,
          muscle_mass: c.anthropometry_json?.muscle_mass
        }
      });
    });

    exams.forEach(e => {
      events.push({
        id: `e_${e.id}`,
        type: 'exam',
        date: parseExamDate(e.exam_date || e.created_at),
        title: 'Exame de Sangue Anexado',
        subtitle: `Laudo clínico analisado por visão computacional e Gemini 1.5 Pro`,
        meta: {
          alertsCount: e.ai_feedback?.alertas?.length || 0,
          insights: e.ai_feedback?.insights,
          exam: e
        }
      });
    });

    mealPlans.forEach(p => {
      events.push({
        id: `p_${p.id}`,
        type: 'mealplan',
        date: new Date(p.created_at),
        title: 'Plano Alimentar Inteligente',
        subtitle: `Dieta ativa de ${p.kcal} kcal estruturada e sugerida pela IA`,
        meta: {
          kcal: p.kcal,
          mealsCount: Object.keys(p.meals || {}).length
        }
      });
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [selectedPatientId, consultations, exams, mealPlans]);

  // Standard visual styles
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[500px] p-6 animate-in fade-in duration-300">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm text-center max-w-lg flex flex-col items-center">
          <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">Acesso Restrito a Profissionais</h2>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            O painel de <strong>Acompanhamento Evolutivo e Predição de Tratamento</strong> é restrito a profissionais de saúde autorizados da clínica.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 flex flex-col h-full font-sans pb-12 text-left">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Acompanhamento Clínico & Evolução
          </h1>
          <p className="text-base font-medium text-slate-500 mt-1">
            Monitore dinamicamente o progresso metabólico, curva de biomarcadores e indicadores de saúde dos seus pacientes.
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider shrink-0">Paciente:</span>
          <select
            value={selectedPatientId}
            onChange={e => {
              const val = e.target.value;
              setSelectedPatientId(val);
              if (val) {
                localStorage.setItem('nutri-ai:selected-patient-id', val);
              } else {
                localStorage.removeItem('nutri-ai:selected-patient-id');
              }
            }}
            disabled={loadingPatients}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 bg-white cursor-pointer shadow-sm hover:border-slate-350 transition-all min-w-[200px]"
          >
            {loadingPatients ? (
              <option>Buscando pacientes...</option>
            ) : patients.length === 0 ? (
              <option>Nenhum paciente ativo</option>
            ) : (
              patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))
            )}
          </select>
        </div>
      </div>

      {!selectedPatientId ? (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm max-w-xl mx-auto flex flex-col items-center justify-center">
          <Activity className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3 animate-pulse" />
          <h3 className="text-lg font-semibold text-slate-900">Nenhum paciente selecionado</h3>
          <p className="text-sm font-medium text-slate-500 mt-1.5 leading-relaxed">
            Selecione ou ative um paciente no painel lateral do seu menu de exames ou consultas para monitorar sua linha de tempo e progressão.
          </p>
        </div>
      ) : loadingContext ? (
        /* Loading Context */
        <div className="flex flex-col items-center justify-center py-32 text-slate-450">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-650 border-t-transparent mb-3" />
          <p className="text-sm font-medium">Consolidando linha do tempo e exames históricos do paciente...</p>
        </div>
      ) : (exams.length === 0 && consultations.length === 0 && mealPlans.length === 0) ? (
        /* Elegant Empty State suggesting upload of the first PDF */
        <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 rounded-3xl p-16 text-center shadow-sm max-w-xl mx-auto flex flex-col items-center justify-center my-12 animate-in fade-in duration-300">
          <div className="h-16 w-16 bg-indigo-50 text-indigo-650 rounded-full flex items-center justify-center border border-indigo-100 mb-6 shadow-sm">
            <FileText className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">Nenhum exame de sangue cadastrado</h3>
          <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed max-w-sm">
            Para visualizar a curva evolutiva de biomarcadores, a projeção preditiva e o fluxo clínico de acompanhamento deste paciente, realize o upload do primeiro laudo em formato PDF na Central de Exames.
          </p>
        </div>
      ) : (
        /* MAIN INTERACTIVE CLINICAL DASHBOARD */
        <div className="space-y-6">
          {/* 1. DYNAMIC IA PREDICTIVE TREATMENT PROGNOSIS CARD */}
          {prediction && (
            <div className="bg-gradient-to-br from-slate-900 via-[#1e1b4b] to-[#312e81] rounded-2xl p-6.5 text-white shadow-sm relative overflow-hidden animate-in fade-in duration-300">
              
              <div className="space-y-6 relative z-10 w-full">
                
                {/* Top row: description, progress */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                  
                  {/* Left block: description */}
                  <div className="flex-1 space-y-4 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-normal text-indigo-300">Tempo estimado baseado na última consulta/exames</span>
                    </div>

                    <h3 className="text-xl font-semibold text-white tracking-tight leading-none">
                      Projeção Preditiva de Evolução Metabólica
                    </h3>
                    
                    <p className="text-sm text-slate-300 font-normal leading-relaxed max-w-3xl">
                      {prediction.description}
                    </p>
                  </div>

                  {/* Right block: Progress Indicator Dial */}
                  <div className="w-full lg:w-80 shrink-0 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 rounded-2xl flex flex-col justify-center space-y-4 shadow-md border-0 text-white">
                    <div className="flex justify-between items-center text-xs font-medium">
                      <span className="text-white/95 uppercase tracking-wider">
                        {prediction.isTreatmentActive ? "Tratamento Ativo" : "Aguardando Início"}
                      </span>
                    </div>
                    
                    <div>
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-3xl font-medium text-white">
                          {prediction.isTreatmentActive ? prediction.progressWeeks : "--"}{" "}
                          <span className="text-base font-medium text-white/80">/ {prediction.baseWeeks} sem</span>
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-white h-full transition-all duration-500" 
                          style={{ width: `${prediction.percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Gráficos de Acompanhamento - Um abaixo do outro */}
          <div className="flex flex-col gap-6">

          {/* Global Style to override Recharts Black Focus Outline */}
          <style>{`
            .recharts-wrapper:focus, .recharts-wrapper:focus-visible { outline: none !important; border: none !important; }
            .recharts-surface:focus { outline: none !important; }
          `}</style>

          {/* Card 1: Biomarkers Evolution */}
          <div className="bg-white p-6 rounded-xl border-2 border-slate-300 shadow-md">
              <div className="flex flex-col gap-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-left">
                    <h4 className="text-base font-semibold text-slate-900">Evolução de Biomarcadores (Exames)</h4>
                    <p className="text-xs text-slate-500 mt-1">Histórico dos biomarcadores analisados pela IA ao longo do tempo</p>
                  </div>
                  
                  {allBiomarkers.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const nextState: Record<string, boolean> = {};
                          allBiomarkers.forEach(name => {
                            nextState[name] = true;
                          });
                          setVisibleBiomarkers(nextState);
                        }}
                        className="px-2 py-1 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 text-[9px] font-semibold text-slate-700 transition-all cursor-pointer focus:outline-none"
                      >
                        Selecionar Todos
                      </button>
                      <button
                        onClick={() => {
                          const nextState: Record<string, boolean> = {};
                          allBiomarkers.forEach(name => {
                            nextState[name] = false;
                          });
                          setVisibleBiomarkers(nextState);
                        }}
                        className="px-2 py-1 rounded bg-slate-50 border border-slate-200 hover:bg-slate-100 text-[9px] font-semibold text-slate-500 transition-all cursor-pointer focus:outline-none"
                      >
                        Limpar Filtro
                      </button>
                    </div>
                  )}
                </div>

                {allBiomarkers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 bg-slate-50 border border-slate-100 p-3 rounded-xl max-h-[120px] overflow-y-auto">
                    {allBiomarkers.map((name, idx) => {
                      const isVisible = visibleBiomarkers[name] !== false;
                      const colors = [
                        '#f43f5e', '#38bdf8', '#34d399', '#fbbf24', '#a78bfa',
                        '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
                        '#2dd4bf', '#fb7185'
                      ];
                      const color = colors[idx % colors.length];
                      return (
                        <button
                          key={name}
                          onClick={() => setVisibleBiomarkers(prev => ({ ...prev, [name]: !isVisible }))}
                          className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all flex items-center gap-1.5 border cursor-pointer focus:outline-none focus-visible:outline-none"
                          style={{ 
                            backgroundColor: isVisible ? `${color}15` : 'transparent',
                            borderColor: isVisible ? color : '#e2e8f0',
                            color: isVisible ? '#1e293b' : '#94a3b8',
                            textDecoration: isVisible ? 'none' : 'line-through'
                          }}
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}

              {biomarkerRechartsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">
                  <Activity className="h-8 w-8 text-slate-400 stroke-[1.5] mb-2" />
                  <p className="text-xs font-medium text-slate-500">Nenhum exame cadastrado com biomarcadores estruturados para este paciente.</p>
                </div>
              ) : (
                <div 
                  className="w-full h-[300px] border border-slate-300 rounded-xl p-2 sm:p-4 bg-slate-50/50"
                  style={{ outline: 'none' }}
                >
                  <ResponsiveContainer width="100%" height="100%" style={{ outline: 'none' }}>
                    <LineChart 
                      data={biomarkerRechartsData} 
                      margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                      className="cursor-pointer"
                      style={{ outline: 'none', border: 'none' }}
                      onMouseDown={(_, e) => (e as React.MouseEvent)?.preventDefault?.()}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="dateStr" stroke="#94a3b8" tick={{ fill: '#475569', fontSize: 10 }} />
                      <YAxis stroke="#94a3b8" tick={{ fill: '#475569', fontSize: 10 }} />
                      <Tooltip 
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                        content={<CustomBiomarkerTooltip resolveOriginal={getOriginalBiomarkerValue} />}
                        shared={false}
                      />
                      {/* Redundant Recharts Legend Removed to match Anthropometry chart */}
                      {allBiomarkers.map((name, idx) => {
                        const isVisible = visibleBiomarkers[name] !== false;
                        const colors = [
                          '#f43f5e', '#38bdf8', '#34d399', '#fbbf24', '#a78bfa',
                          '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
                          '#2dd4bf', '#fb7185'
                        ];
                        const color = colors[idx % colors.length];
                        return (
                          <Line
                            key={name}
                            type="monotone"
                            dataKey={name}
                            stroke={color}
                            strokeWidth={2.5}
                            dot={{ r: 6, strokeWidth: 2, cursor: 'pointer' }}
                            activeDot={{ r: 8, cursor: 'pointer' }}
                            connectNulls
                            name={name}
                            hide={!isVisible}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              </div>
            </div>

            {/* Card 2: Anthropometric Correlation */}
            <div className="bg-white p-6 rounded-xl border-2 border-slate-300 shadow-md">
              <div className="flex flex-col gap-4 text-left">
              <div className="text-left">
                <h4 className="text-base font-semibold text-slate-900">Correlação Antropométrica (Composição Corporal)</h4>
                <p className="text-xs text-slate-500 mt-1">Evolução do peso vs gordura e músculo com base nas consultas realizadas</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'weight', label: 'Peso (kg)', color: '#f43f5e' },
                  { key: 'bodyFat', label: 'Gordura (%)', color: '#f59e0b' },
                  { key: 'muscleMass', label: 'Massa Muscular (%)', color: '#10b981' }
                ].map(field => {
                  const isVisible = visibleAnthropometry[field.key] !== false;
                  return (
                    <button
                      key={field.key}
                      onClick={() => setVisibleAnthropometry(prev => ({ ...prev, [field.key]: !isVisible }))}
                      className="px-2.5 py-1 rounded-full text-[10px] font-medium transition-all flex items-center gap-1.5 border cursor-pointer"
                      style={{ 
                        backgroundColor: isVisible ? `${field.color}15` : 'transparent',
                        borderColor: isVisible ? field.color : '#e2e8f0',
                        color: isVisible ? '#1e293b' : '#94a3b8',
                        textDecoration: isVisible ? 'none' : 'line-through'
                      }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: field.color }} />
                      {field.label}
                    </button>
                  );
                })}
              </div>

              {anthropometryRechartsData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] bg-slate-50 border border-slate-100 rounded-xl p-6 text-center">
                  <Activity className="h-8 w-8 text-slate-400 stroke-[1.5] mb-2" />
                  <p className="text-xs font-medium text-slate-500">Nenhuma avaliação física (peso, gordura, músculo) registrada nas consultas deste paciente.</p>
                </div>
              ) : (
                <div className="w-full h-[300px] border border-slate-200 rounded-xl p-2 sm:p-4 bg-slate-50/30 focus:outline-none">
                  <ResponsiveContainer width="100%" height="100%" className="focus:outline-none">
                    <AreaChart 
                      data={anthropometryRechartsData} 
                      margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                      className="cursor-pointer"
                      style={{ outline: 'none', border: 'none' }}
                      onMouseDown={(_, e) => (e as React.MouseEvent)?.preventDefault?.()}
                    >
                      <defs>
                        <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMuscle" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="dateStr" stroke="#94a3b8" tick={{ fill: '#475569', fontSize: 10 }} />
                      <YAxis yAxisId="left" stroke="#f43f5e" tick={{ fill: '#e11d48', fontSize: 10 }} label={{ value: 'Peso (kg)', angle: -90, position: 'insideLeft', fill: '#e11d48', fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#10b981" tick={{ fill: '#059669', fontSize: 10 }} label={{ value: 'Percentual (%)', angle: 90, position: 'insideRight', fill: '#059669', fontSize: 10 }} />
                      <Tooltip 
                        trigger="click" 
                        shared={true} 
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '3 3' }}
                        content={<CustomAnthropometryTooltip />}
                      />
                      {/* Redundant Recharts Legend Removed */}
                      <Area 
                        yAxisId="left" 
                        type="monotone" 
                        dataKey="weight" 
                        name="Peso (kg)" 
                        stroke="#f43f5e" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#colorWeight)" 
                        connectNulls 
                        hide={!visibleAnthropometry.weight} 
                      />
                      <Area 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="bodyFat" 
                        name="Gordura (%)" 
                        stroke="#f59e0b" 
                        strokeWidth={2} 
                        strokeDasharray="4 4" 
                        fillOpacity={1} 
                        fill="url(#colorFat)" 
                        connectNulls 
                        hide={!visibleAnthropometry.bodyFat} 
                      />
                      <Area 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="muscleMass" 
                        name="Massa Muscular (%)" 
                        stroke="#10b981" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#colorMuscle)" 
                        connectNulls 
                        hide={!visibleAnthropometry.muscleMass} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              </div>
            </div>

          </div>

          {/* HISTÓRICO E FLUXO DE CONSULTAS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6.5 shadow-sm flex flex-col min-h-[250px] text-left">
            <div className="border-b border-slate-100 pb-3.5 shrink-0 flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  Histórico e Fluxo de Consultas
                </h3>
                <p className="text-[10px] font-normal text-slate-500 uppercase tracking-wider mt-0.5">Fluxo de agendamentos e status dos atendimentos</p>
              </div>
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                {appointments.length} Consultas
              </span>
            </div>

            {/* Consultation List */}
            <div className="flex-1 overflow-y-auto max-h-[350px] pr-1">
              {appointments.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="w-8 h-8 text-slate-250 stroke-[1.2] mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-500">Nenhum histórico de consultas anteriores encontrado para este paciente.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {appointments.map((apt) => {
                    const dateObj = new Date(apt.date_time);
                    const formattedDate = format(dateObj, 'dd/MM/yyyy');
                    const formattedTime = format(dateObj, 'HH:mm');
                    const service = pickOne(apt.services);
                    const serviceName = service?.name || 'Consulta Geral';
                    const modality = service?.modality || 'Presencial';
                    
                    // Status color mappings
                    const { badge: statusBadge, label: statusLabel } =
                      apt.status === 'concluido'
                        ? { badge: 'bg-emerald-50/50 border-emerald-100/30 text-emerald-600', label: 'Realizada' }
                        : apt.status === 'cancelado'
                          ? { badge: 'bg-rose-50/50 border-rose-100/30 text-rose-600', label: 'Cancelada' }
                          : { badge: 'bg-teal-50/50 border border-teal-150/30 text-teal-650', label: 'Agendada' };

                    const consultation = pickOne(apt.consultations);
                    const hasDetails = apt.status === 'concluido' && !!consultation;

                    return (
                      <div key={apt.id} className="bg-slate-50/40 border border-slate-200/75 p-4 rounded-xl flex flex-col justify-between gap-3 hover:bg-white hover:border-slate-350 hover:shadow-sm transition-all duration-200">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-lg border ${statusBadge}`}>
                              {statusLabel}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded-lg">
                              {modality}
                            </span>
                          </div>
                          
                          <h4 className="text-sm font-semibold text-slate-900 leading-snug">{serviceName}</h4>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border-t border-slate-100 pt-2.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedDate}</span>
                            <span className="text-slate-300">•</span>
                            <span>{formattedTime}h</span>
                          </div>

                          {hasDetails && (
                            <button
                              onClick={() => setSelectedAptForModal(apt)}
                              className="w-full text-center py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100/70 text-[10px] font-semibold text-indigo-700 rounded-xl transition-all flex items-center justify-center gap-1 focus:outline-none shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ver o que foi feito
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Grid: Journey Timeline (Full Width) */}
          <div className="w-full">
            
            {/* Timeline vertical journal */}
            <div className="w-full bg-white border border-slate-200 rounded-2xl p-6.5 shadow-sm flex flex-col h-[520px] overflow-hidden">
              
              <div className="border-b border-slate-100 pb-3.5 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                    <CalendarRange className="w-5 h-5 text-teal-650" />
                    Sinopse da Jornada Clínica do Paciente
                  </h3>
                  <p className="text-[10px] font-normal text-slate-500 uppercase tracking-wider mt-0.5">Visão cronológica de eventos integrados</p>
                </div>
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  {timelineEvents.length} Eventos
                </span>
              </div>

              {/* Reverse Chronological timeline list */}
              <div className="flex-1 overflow-y-auto pt-4 pr-1 min-h-0 space-y-4">
                {timelineEvents.length === 0 ? (
                  <div className="text-center py-24 text-slate-400">
                    <ClipboardList className="w-10 h-10 text-slate-250 stroke-[1.2] mx-auto mb-2" />
                    <p className="text-sm font-medium">Nenhum evento registrado na jornada</p>
                    <p className="text-xs mt-0.5">Consultas e análises aparecerão automaticamente aqui.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 border-l border-slate-200 space-y-6">
                    {timelineEvents.map((evt) => {
                      const eventDate = format(evt.date, 'dd/MM/yyyy');
                      
                      return (
                        <div key={evt.id} className="relative group text-left">
                          
                          {/* Timeline node dot */}
                          <div className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 bg-white transition-transform group-hover:scale-110 shadow-sm flex items-center justify-center ${
                            evt.type === 'consultation'
                              ? 'border-indigo-500 text-indigo-500'
                              : evt.type === 'exam'
                                ? 'border-teal-500 text-teal-500'
                                : 'border-emerald-500 text-emerald-500'
                          }`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              evt.type === 'consultation'
                                ? 'bg-indigo-500'
                                : evt.type === 'exam'
                                  ? 'bg-teal-500'
                                  : 'bg-emerald-500'
                            }`} />
                          </div>

                          {/* Event Card Content */}
                          <div className="bg-slate-50/50 hover:bg-white border border-slate-200/70 hover:border-slate-300 p-4 rounded-xl shadow-sm transition-all duration-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-lg border ${
                                  evt.type === 'consultation'
                                    ? 'bg-indigo-50 border-indigo-150 text-indigo-700'
                                    : evt.type === 'exam'
                                      ? 'bg-teal-50 border-teal-150 text-teal-700'
                                      : 'bg-emerald-50 border-emerald-150 text-emerald-700'
                                }`}>
                                  {evt.type === 'consultation' ? 'Consulta' : evt.type === 'exam' ? 'Laudo' : 'Dieta'}
                                </span>
                                <span className="text-xs font-normal text-slate-500">{eventDate}</span>
                              </div>

                              <h4 className="text-sm font-semibold text-slate-900 leading-snug">{evt.title}</h4>
                              <p className="text-xs font-normal text-slate-500">{evt.subtitle}</p>

                              {/* Nested micro-data details based on type */}
                              {evt.type === 'consultation' && evt.meta.weight && (
                                <div className="flex gap-4 text-[10px] font-medium text-slate-500 bg-white border border-slate-200 p-1.5 rounded-xl w-fit">
                                  <span>Peso: {evt.meta.weight} kg</span>
                                  <span>Gordura: {evt.meta.body_fat}%</span>
                                  <span>Músculo: {evt.meta.muscle_mass} kg</span>
                                </div>
                              )}

                              {evt.type === 'exam' && (evt.meta.alertsCount ?? 0) > 0 && (
                                <div className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 bg-rose-50/50 border border-rose-100/50 px-2 py-0.5 rounded-lg">
                                  ⚠️ {evt.meta.alertsCount} biomarcadores alterados
                                </div>
                              )}
                            </div>

                            {/* Journey Link action */}
                            <div className="shrink-0 flex items-center justify-end">
                              <button
                                onClick={() => {
                                  if (evt.type === 'exam') {
                                    setSelectedExamForModal(evt.meta.exam ?? null);
                                  } else {
                                    showToast('Para visualizar consultas completas ou dietas estruturadas, navegue pelos respectivos painéis no menu lateral.', 'info');
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-650 bg-white border border-slate-200/80 px-2.5 py-1.5 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 hover:text-slate-900 transition-all focus:outline-none"
                              >
                                <Eye className="w-3.5 h-3.5" /> Ver Detalhes
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>
      )}

      {/* 4. MODAL DETALHES DO EXAME DA JORNADA */}
      {selectedExamForModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in scale-in duration-300">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
              <div className="space-y-1">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 w-fit uppercase tracking-wider">
                  <Sparkles className="w-3 h-3 text-[#5024fc]" /> Análise de Exame Clínico
                </span>
                <h3 className="text-lg font-semibold text-slate-900 tracking-tight leading-snug">
                  Detalhes do Laudo Anexado
                </h3>
              </div>
              <button 
                onClick={() => setSelectedExamForModal(null)} 
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors border border-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* SEÇÃO A: Documento Original PDF Storage */}
              <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Documento Original do Paciente</p>
                    <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      {selectedExamForModal.file_url.split('/').pop() || 'Exames Gyselle Completo.pdf'}
                    </h4>
                  </div>

                  {loadingPdfUrl ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-teal-650 border-t-transparent" />
                      Gerando link seguro...
                    </div>
                  ) : modalPdfUrl ? (
                    <a 
                      href={modalPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 rounded-lg shadow-sm transition-all"
                    >
                      <Eye className="w-4 h-4" /> Abrir / Download PDF
                    </a>
                  ) : (
                    <span className="text-xs font-medium text-rose-600">Erro ao carregar PDF</span>
                  )}
                </div>
              </div>

              {/* SEÇÃO B: Parecer Clínico (Insights da IA) */}
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Parecer Clínico-Nutricional (Gemini AI)
                </h4>
                <div className="bg-indigo-50/20 border border-indigo-100/50 p-5 rounded-2xl">
                  <p className="text-xs font-normal text-slate-650 leading-relaxed whitespace-pre-line">
                    {selectedExamForModal.ai_feedback?.insights || "Nenhum parecer gerado para este exame."}
                  </p>
                </div>
              </div>

              {/* SEÇÃO C: Biomarcadores e Notas Manuais (nota_clinica) */}
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#5024fc]" /> Biomarcadores Lidos & Anotações Clínicas
                </h4>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 font-medium text-slate-500 uppercase tracking-wider">Biomarcador</th>
                        <th className="px-4 py-3 font-medium text-slate-500 uppercase tracking-wider">Resultado</th>
                        <th className="px-4 py-3 font-medium text-slate-500 uppercase tracking-wider">Referência</th>
                        <th className="px-4 py-3 font-medium text-slate-500 uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {selectedExamForModal.ai_feedback?.todos_biomarcadores?.map((bio: ExamBiomarker, idx: number) => {
                        const isAlterado = bio.status?.toLowerCase() === 'alterado';
                        return (
                          <React.Fragment key={idx}>
                            {/* Biomarker Core Info Row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="px-4 py-3.5 font-medium text-slate-900">{bio.marcador}</td>
                              <td className="px-4 py-3.5 font-semibold text-slate-900">{bio.valor}</td>
                              <td className="px-4 py-3.5 font-normal text-slate-500">{bio.referencia}</td>
                              <td className="px-4 py-3.5 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[9px] font-medium uppercase border ${
                                  isAlterado
                                    ? 'bg-rose-50/50 border-rose-100/50 text-rose-600'
                                    : 'bg-emerald-50/50 border-emerald-100/50 text-emerald-600'
                                }`}>
                                  {isAlterado ? 'Alterado' : 'Normal'}
                                </span>
                              </td>
                            </tr>
                            
                            {/* nota_clinica Row if present */}
                            {bio.nota_clinica && (
                              <tr className="bg-teal-50/5">
                                <td colSpan={4} className="px-4 py-2.5 border-t border-slate-100">
                                  <div className="flex items-start gap-1.5 text-slate-650 bg-emerald-50/10 border border-emerald-100/50 p-2.5 rounded-xl">
                                    <ClipboardList className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    <div className="text-[10px] leading-relaxed">
                                      <span className="font-semibold text-emerald-600 uppercase tracking-wider">Anotação Nutricional: </span>
                                      <span className="font-normal text-slate-600">{bio.nota_clinica}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      
                      {(!selectedExamForModal.ai_feedback?.todos_biomarcadores || selectedExamForModal.ai_feedback.todos_biomarcadores.length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500 font-medium">
                            Nenhum biomarcador detalhado disponível.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 p-4 shrink-0 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setSelectedExamForModal(null)} 
                className="px-5 py-2 text-xs font-semibold text-slate-650 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all focus:outline-none"
              >
                Fechar Detalhes
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. MODAL RESUMO DO ATENDIMENTO (O QUE FOI FEITO) */}
      {selectedAptForModal && (() => {
        const consultation = pickOne(selectedAptForModal.consultations);
        const ant: AnthropometryJson = consultation?.anthropometry_json ?? {};
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in scale-in duration-300">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
                <div className="space-y-0.5">
                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 w-fit">
                    <ClipboardList className="w-3 h-3 text-[#5024fc]" /> Resumo do Atendimento
                  </span>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {pickOne(selectedAptForModal.services)?.name || 'Consulta Geral'}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedAptForModal(null)} 
                  className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Section 1: Anamnese Notes */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#5024fc]" /> Anotações de Anamnese
                  </h4>
                  <div className="bg-indigo-50/20 border border-indigo-100/50 p-4.5 rounded-2xl">
                    <p className="text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                      {consultation?.anamnese_notes || "Nenhuma anotação de anamnese registrada."}
                    </p>
                  </div>
                </div>

                {/* Section 2: Anthropometry Collected */}
                {(ant.weight || ant.body_fat || ant.muscle_mass) && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-[#5024fc]" /> Avaliação Física Coletada
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {ant.weight && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Peso</p>
                          <p className="text-lg font-medium text-[#5024fc] mt-1">{ant.weight} kg</p>
                        </div>
                      )}
                      {ant.body_fat && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Gordura</p>
                          <p className="text-lg font-medium text-[#5024fc] mt-1">{ant.body_fat}%</p>
                        </div>
                      )}
                      {ant.muscle_mass && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Massa Muscular</p>
                          <p className="text-lg font-medium text-[#5024fc] mt-1">{ant.muscle_mass} kg</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="border-t border-slate-100 p-4 shrink-0 bg-slate-50/50 flex justify-end">
                <button 
                  onClick={() => setSelectedAptForModal(null)} 
                  className="px-5 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all focus:outline-none"
                >
                  Fechar Resumo
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};
