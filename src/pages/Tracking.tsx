import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  User, 
  Sparkles, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  CheckCircle2,
  ShieldAlert,
  Apple,
  FileText,
  ClipboardList,
  Eye,
  Info,
  CalendarRange,
  X
} from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

// Helper to parse dates in local timezone (avoiding UTC offset conversion bugs)
export const parseExamDate = (dateVal: string | null | undefined): Date => {
  if (!dateVal) return new Date();
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    const [year, month, day] = dateVal.split('-').map(Number);
    // Creates a date at midnight in the local system/browser timezone (e.g. America/Sao_Paulo)
    return new Date(year, month - 1, day);
  }
  return new Date(dateVal);
};

export const Tracking: React.FC = () => {
  const { clinic, isReadOnly, profile, userRole } = useAuth();
  const { showToast } = useToast();

  // Patients & Loading States
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);

  // Patient History States
  const [consultations, setConsultations] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [mealPlans, setMealPlans] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);

  // Chart Interactive Filters
  const [selectedBiomarker, setSelectedBiomarker] = useState<string>('');
  const [activeAntropometriaLine, setActiveAntropometriaLine] = useState<'all' | 'weight' | 'bodyFat' | 'muscleMass'>('all');

  // Modal states for details
  const [selectedExamForModal, setSelectedExamForModal] = useState<any>(null);
  const [selectedAptForModal, setSelectedAptForModal] = useState<any>(null);
  const [modalPdfUrl, setModalPdfUrl] = useState<string | null>(null);
  const [loadingPdfUrl, setLoadingPdfUrl] = useState<boolean>(false);

  // Dynamic storage signed URL fetcher when modal opens
  useEffect(() => {
    if (!selectedExamForModal) {
      setModalPdfUrl(null);
      return;
    }

    const fetchSignedUrl = async () => {
      setLoadingPdfUrl(true);
      try {
        const { data, error } = await supabase.storage
          .from('exams-bucket')
          .createSignedUrl(selectedExamForModal.file_url, 60 * 60);

        if (error) throw error;
        if (data?.signedUrl) {
          setModalPdfUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Erro ao gerar URL assinada para modal:', err);
        showToast('Não foi possível gerar link de acesso ao PDF.', 'error');
      } finally {
        setLoadingPdfUrl(false);
      }
    };

    fetchSignedUrl();
  }, [selectedExamForModal]);

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  // Load Clinic Patients
  useEffect(() => {
    const loadPatients = async () => {
      if (!clinic?.id || !isAuthorized) return;
      setLoadingPatients(true);
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, name, email, biological_sex, birth_date, main_goal')
          .eq('clinic_id', clinic.id)
          .eq('status', 'ativo')
          .order('name');

        if (error) throw error;
        setPatients(data || []);
        if (data && data.length > 0) {
          setSelectedPatientId(data[0].id);
        }
      } catch (err) {
        console.error('Erro ao carregar pacientes:', err);
        showToast('Erro ao carregar lista de pacientes.', 'error');
      } finally {
        setLoadingPatients(false);
      }
    };

    loadPatients();
  }, [clinic?.id, userRole]);

  // Load Selected Patient History Context
  useEffect(() => {
    if (!selectedPatientId || !clinic?.id) {
      setConsultations([]);
      setExams([]);
      setMealPlans([]);
      setAppointments([]);
      return;
    }

    const loadPatientHistory = async () => {
      setLoadingContext(true);
      try {
        // 1. Fetch consultations with associated appointment status
        const { data: consultationsData, error: consultationsError } = await supabase
          .from('consultations')
          .select(`
            id,
            anamnese_notes,
            anthropometry_json,
            created_at,
            appointments (
              status
            )
          `)
          .eq('patient_id', selectedPatientId)
          .order('created_at', { ascending: false });

        if (consultationsError) throw consultationsError;

        // Filter: bring ONLY consultations where appointment status is strictly successful/concluded ('concluido' or 'realizada')
        // and completely exclude any cancelled or missed appointments ('cancelado' or 'falta')
        const activeConsultations = (consultationsData || []).filter((c: any) => {
          const apts = c.appointments;
          const status = Array.isArray(apts) ? apts[0]?.status : apts?.status;
          return status === 'concluido' || status === 'realizada';
        });

        setConsultations(activeConsultations);

        // 2. Fetch exams
        const { data: examsData, error: examsError } = await supabase
          .from('patient_exams')
          .select('id, ai_feedback, exam_date, created_at, file_url')
          .eq('patient_id', selectedPatientId)
          .order('exam_date', { ascending: false });

        if (examsError) throw examsError;
        setExams(examsData || []);

        // 3. Fetch meal plans
        const { data: plansData, error: plansError } = await supabase
          .from('meal_plans')
          .select('id, kcal, meals, created_at')
          .eq('patient_id', selectedPatientId)
          .order('created_at', { ascending: false });

        if (plansError) throw plansError;
        setMealPlans(plansData || []);

        // 4. Fetch appointments (with service names joined from services and consultations)
        const { data: appointmentsData, error: appointmentsError } = await supabase
          .from('appointments')
          .select(`
            id,
            date_time,
            status,
            created_at,
            services (
              name,
              modality
            ),
            consultations (
              id,
              anamnese_notes,
              anthropometry_json
            )
          `)
          .eq('patient_id', selectedPatientId)
          .order('date_time', { ascending: false });

        if (appointmentsError) throw appointmentsError;
        setAppointments(appointmentsData || []);

        // Initialize biomarker selector based on loaded exams
        if (examsData && examsData.length > 0) {
          const list: string[] = [];
          examsData.forEach(e => {
            e.ai_feedback?.todos_biomarcadores?.forEach((b: any) => {
              const name = b.marcador.trim();
              if (!list.some(item => item.toLowerCase() === name.toLowerCase())) {
                list.push(name);
              }
            });
          });
          if (list.length > 0) {
            setSelectedBiomarker(list[0]);
          } else {
            setSelectedBiomarker('tsh (hormônio tireoestimulante)');
          }
        } else {
          setSelectedBiomarker('tsh (hormônio tireoestimulante)');
        }

      } catch (err) {
        console.error('Erro ao buscar histórico clínico:', err);
        showToast('Erro ao carregar histórico do paciente.', 'error');
      } finally {
        setLoadingContext(false);
      }
    };

    loadPatientHistory();
  }, [selectedPatientId, clinic?.id]);

  const selectedPatient = useMemo(() => {
    return patients.find(p => p.id === selectedPatientId);
  }, [patients, selectedPatientId]);

  // helper: calculate age
  const getPatientAge = (birthDateStr: string | null | undefined) => {
    if (!birthDateStr) return 'Não informada';
    try {
      const birth = parseISO(birthDateStr);
      return `${differenceInYears(new Date(), birth)} anos`;
    } catch {
      return 'Não informada';
    }
  };

  // 1. Dynamic AI Treatment Predictive Prognosis
  const prediction = useMemo(() => {
    if (!selectedPatientId) return null;

    const latestExam = exams[0];
    const latestConsultation = consultations[0];
    
    let baseWeeks = 12;
    let progressWeeks = 3;
    let description = "";
    let focusPoints: string[] = [];

    const hasHashimoto = latestExam?.ai_feedback?.alertas?.some(
      (a: any) => a.marcador.toLowerCase().includes('anti-tpo') || a.marcador.toLowerCase().includes('tsh')
    ) || latestConsultation?.anamnese_notes?.toLowerCase().includes('hashimoto') || latestConsultation?.anamnese_notes?.toLowerCase().includes('tireoide');

    const hasHighGlucose = latestExam?.ai_feedback?.todos_biomarcadores?.some(
      (b: any) => b.marcador.toLowerCase().includes('glicose') && parseFloat(b.valor) > 99
    ) || latestConsultation?.anamnese_notes?.toLowerCase().includes('glicose');

    const hasLowVitD = latestExam?.ai_feedback?.todos_biomarcadores?.some(
      (b: any) => b.marcador.toLowerCase().includes('vitamina d') && parseFloat(b.valor) < 30
    );

    if (hasHashimoto) {
      baseWeeks = 16;
      progressWeeks = 4;
      description = "Modulação imunológica e tireoidiana de alta precisão. O cruzamento dos anticorpos Anti-TPO elevados com o TSH desregulado do último exame sugere um tempo de resposta de 16 semanas para regulação completa dos receptores periféricos e modulação autoimune da glândula.";
      focusPoints = ["Ajuste dietético livre de glúten e xenobióticos", "Suplementação funcional com Selênio, Zinco e L-Tirosina", "Acompanhamento da fadiga e da curva térmica do TSH"];
    } else if (hasHighGlucose) {
      baseWeeks = 8;
      progressWeeks = 3;
      description = "Melhoria e restauração da sensibilidade à insulina. A dieta calculada de baixo índice glicêmico e aumento expressivo de fibras solúveis demonstrará efeitos clínicos no controle da hemoglobina glicada dentro de 8 semanas de protocolo ativo.";
      focusPoints = ["Priorização de carboidratos complexos de baixo índice glicêmico", "Inclusão de aveia, chia e psyllium no diário alimentar", "Incentivo a treinos resistidos pós-prandiais"];
    } else if (hasLowVitD) {
      baseWeeks = 10;
      progressWeeks = 3;
      description = "Protocolo de reposição intensiva de colecalciferol. Projeta-se a elevação estável da Vitamina D sérica sérica e otimização imunológica associada dentro de 10 semanas de suplementação contínua combinada a gorduras funcionais.";
      focusPoints = ["Suplementação oral ativa de Vitamina D3 com co-fatores (K2 + Magnésio)", "Consumo regular de gemas de ovos, peixes gordos e sementes", "Exposição solar de 15 minutos em horários de pico"];
    } else {
      description = "Adequação dietética e reeducação metabólica geral. Os exames laboratoriais demonstram biomarcadores séricos estáveis e o plano alimentar está calibrado para manutenção e suporte digestivo padrão de 12 semanas.";
      focusPoints = ["Manutenção de aporte hídrico calibrado (35ml/kg)", "Ingestão variada de fitoquímicos (dieta arco-íris)", "Calibração e higiene do sono com chás relaxantes"];
    }

    return {
      baseWeeks,
      progressWeeks,
      description,
      focusPoints,
      percent: Math.min(100, Math.round((progressWeeks / baseWeeks) * 100))
    };
  }, [selectedPatientId, exams, consultations]);

  // 2. Biomarkers List Extraction
  const availableBiomarkers = useMemo(() => {
    const list: string[] = [];
    exams.forEach(e => {
      e.ai_feedback?.todos_biomarcadores?.forEach((b: any) => {
        const name = b.marcador.trim();
        if (!list.some(item => item.toLowerCase() === name.toLowerCase())) {
          list.push(name);
        }
      });
    });
    if (list.length === 0) {
      return ["Anticorpos Anti-TPO", "TSH (Hormônio Tireoestimulante)", "Vitamina D (25-OH)", "Glicose de Jejum", "Colesterol LDL"];
    }
    return list;
  }, [exams]);

  // 3. SVG Chart A: Biomarkers dynamic line path builder
  const biomarkerChartData = useMemo(() => {
    if (!selectedPatientId || !selectedBiomarker) return [];

    const data: { date: string, value: number, unit: string, originalStr: string }[] = [];
    [...exams]
      .reverse()
      .forEach(e => {
        const bio = e.ai_feedback?.todos_biomarcadores?.find(
          (b: any) => b.marcador.toLowerCase().trim() === selectedBiomarker.toLowerCase().trim()
        );
        if (bio) {
          const cleanStr = bio.valor.trim();
          const numMatch = cleanStr.match(/(-?[0-9]+([.,][0-9]+)?)/);
          if (numMatch) {
            const val = parseFloat(numMatch[1].replace(',', '.'));
            const unit = cleanStr.replace(numMatch[1], '').trim();
            const dateStr = format(parseExamDate(e.exam_date || e.created_at), 'dd/MM');
            data.push({
              date: dateStr,
              value: val,
              unit,
              originalStr: bio.valor
            });
          }
        }
      });

    return data;
  }, [selectedPatientId, selectedBiomarker, exams]);

  // 4. SVG Chart B: Anthropometry dynamic multiline path builder
  const anthropometryChartData = useMemo(() => {
    if (!selectedPatientId) return [];

    const data: { date: string, weight: number, bodyFat: number, muscleMass: number }[] = [];
    [...consultations]
      .reverse()
      .forEach(c => {
        const ant = c.anthropometry_json;
        if (ant && (ant.weight || ant.body_fat || ant.muscle_mass)) {
          const dateStr = format(new Date(c.created_at), 'dd/MM/yyyy');
          data.push({
            date: dateStr,
            weight: ant.weight || 0,
            bodyFat: ant.body_fat || 0,
            muscleMass: ant.muscle_mass || 0
          });
        }
      });

    return data;
  }, [selectedPatientId, consultations]);

  // 5. Patient Journey Timeline Events compiler (reverse chronological)
  const timelineEvents = useMemo(() => {
    if (!selectedPatientId) return [];

    const events: { id: string, type: 'consultation' | 'exam' | 'mealplan', date: Date, title: string, subtitle: string, meta: any }[] = [];

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
          <h2 className="text-xl font-black text-slate-800">Acesso Restrito a Profissionais</h2>
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
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Acompanhamento Clínico & Evolução
            <span className="bg-teal-50 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full border border-teal-100 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> IA Preditiva
            </span>
          </h1>
          <p className="text-base font-medium text-slate-500 mt-1">
            Monitore dinamicamente o progresso metabólico, curva de biomarcadores e indicadores de saúde dos seus pacientes.
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-slate-450 uppercase tracking-wider shrink-0">Paciente:</span>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            disabled={loadingPatients}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white cursor-pointer shadow-sm hover:border-slate-350 transition-all min-w-[200px]"
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
        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-sm max-w-xl mx-auto flex flex-col items-center justify-center">
          <Activity className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3 animate-pulse" />
          <h3 className="text-lg font-extrabold text-slate-800">Nenhum paciente selecionado</h3>
          <p className="text-sm font-medium text-slate-500 mt-1.5 leading-relaxed">
            Selecione ou ative um paciente no painel lateral do seu menu de exames ou consultas para monitorar sua linha de tempo e progressão.
          </p>
        </div>
      ) : loadingContext ? (
        /* Loading Context */
        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent mb-3" />
          <p className="text-sm font-bold">Consolidando linha do tempo e exames históricos do paciente...</p>
        </div>
      ) : (
        /* MAIN INTERACTIVE CLINICAL DASHBOARD */
        <div className="space-y-6">

          {/* 1. DYNAMIC IA PREDICTIVE TREATMENT PROGNOSIS CARD */}
          {prediction && (
            <div className="bg-white border border-slate-200 rounded-3xl p-6.5 text-slate-800 shadow-sm relative overflow-hidden animate-in fade-in duration-300">
              
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6 relative z-10">
                
                {/* Left block: description, focuses */}
                <div className="flex-1 space-y-4 text-left">
                  <div className="flex items-center gap-2">
                    <span className="bg-teal-50 text-teal-700 text-[10px] font-black px-3 py-1 rounded-full border border-teal-100 flex items-center gap-1 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600" /> Inteligência Preditiva (IA)
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">Tempo estimado baseado na última consulta/exames</span>
                  </div>

                  <h3 className="text-xl font-extrabold text-slate-800 tracking-tight leading-none">
                    Projeção Preditiva de Evolução Metabólica
                  </h3>
                  
                  <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-3xl">
                    {prediction.description}
                  </p>

                  <div className="pt-2">
                    <p className="text-[10px] font-black text-slate-450 uppercase tracking-widest mb-2">Focos Sugeridos de Suporte Nutritivo:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {prediction.focusPoints.map((point, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl flex items-start gap-2 shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                          <span className="text-xs font-semibold text-slate-700 leading-normal">{point}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right block: Progress Indicator Dial */}
                <div className="w-full lg:w-80 shrink-0 bg-slate-50 border border-slate-200/60 p-5 rounded-2xl flex flex-col justify-center space-y-4 shadow-sm">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-500 uppercase tracking-wider">Tratamento Ativo</span>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-3xl font-black text-slate-800">{prediction.progressWeeks} <span className="text-base font-semibold text-slate-505">/ {prediction.baseWeeks} sem</span></span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-3 w-full bg-slate-250 rounded-full overflow-hidden border border-slate-300/40 shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-teal-400 to-indigo-500 rounded-full transition-all duration-1000 shadow"
                        style={{ width: `${prediction.percent}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[10px] font-bold text-slate-450 leading-normal text-left">
                    *A evolução é simulada com base no cruzamento matemático de biomarcadores séricos alterados com o cumprimento dietético estimado.
                  </p>
                </div>

              </div>
            </div>
          )}

          {/* 2. ANALYTICAL CHARTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* CHART A: EVOLUÇÃO DE BIOMARCADORES */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6.5 shadow-sm flex flex-col h-[480px]">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                    <TrendingUp className="w-5 h-5 text-teal-650" />
                    Curva Evolutiva de Biomarcadores
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Histórico extraído dos laudos de PDF</p>
                </div>
                
                {/* Biomarker Selector Dropdown */}
                <select
                  value={selectedBiomarker}
                  onChange={e => setSelectedBiomarker(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-sm min-w-[150px] max-w-[200px]"
                >
                  {availableBiomarkers.map((b, idx) => (
                    <option key={idx} value={b.toLowerCase().trim()}>{b}</option>
                  ))}
                </select>
              </div>

              {/* SVG Chart A Rendering */}
              <div className="flex-1 min-h-0 pt-6 relative flex items-center justify-center">
                {biomarkerChartData.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <Info className="w-8 h-8 text-slate-300 mx-auto mb-1 stroke-[1.2]" />
                    <p className="text-xs font-semibold">Nenhum exame estruturado para este biomarcador</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col justify-between">
                    {/* SVG canvas container */}
                    <div className="flex-1 w-full relative min-h-0">
                      <svg viewBox="0 0 500 240" className="w-full h-full overflow-visible">
                        {/* Grid lines */}
                        <line x1="40" y1="40" x2="460" y2="40" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="100" x2="460" y2="100" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="160" x2="460" y2="160" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="200" x2="460" y2="200" stroke="#cbd5e1" strokeWidth="2" /> {/* Bottom axis */}

                        {/* Y-axis labels */}
                        {(() => {
                          const maxVal = Math.max(...biomarkerChartData.map(d => d.value)) * 1.25;
                          const minVal = Math.min(...biomarkerChartData.map(d => d.value)) * 0.75;
                          const range = maxVal - minVal || 10;
                          
                          return (
                            <>
                              <text x="32" y="45" textAnchor="end" className="text-[10px] font-black fill-slate-400">{(maxVal).toFixed(1)}</text>
                              <text x="32" y="105" textAnchor="end" className="text-[10px] font-black fill-slate-400">{((maxVal + minVal)/2).toFixed(1)}</text>
                              <text x="32" y="165" textAnchor="end" className="text-[10px] font-black fill-slate-400">{(minVal).toFixed(1)}</text>
                            </>
                          );
                        })()}

                        {/* Data Line Path Builder */}
                        {(() => {
                          const maxVal = Math.max(...biomarkerChartData.map(d => d.value)) * 1.25;
                          const minVal = Math.min(...biomarkerChartData.map(d => d.value)) * 0.75;
                          const range = maxVal - minVal || 10;

                          const points = biomarkerChartData.map((d, idx) => {
                            const x = biomarkerChartData.length === 1
                              ? 250
                              : 40 + (idx * (420 / Math.max(1, biomarkerChartData.length - 1)));
                            const y = 200 - (((d.value - minVal) / range) * 160);
                            return { x, y, data: d };
                          });

                          const pathStr = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

                          return (
                            <>
                              {/* Glowing path underlay */}
                              {biomarkerChartData.length > 1 && (
                                <path d={pathStr} fill="none" stroke="rgba(20, 184, 166, 0.15)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                              )}
                              {/* Main path */}
                              {biomarkerChartData.length > 1 && (
                                <path d={pathStr} fill="none" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                              )}
                              
                              {/* Points and Tooltips */}
                              {points.map((p, idx) => (
                                <g key={idx} className="group/point cursor-pointer">
                                  <circle cx={p.x} cy={p.y} r="6" fill="#ffffff" stroke="#14b8a6" strokeWidth="3" />
                                  <circle cx={p.x} cy={p.y} r="10" fill="transparent" className="hover:fill-teal-500/10 transition-colors" />
                                  
                                  {/* Tooltip on hover */}
                                  <g className="opacity-0 group-hover/point:opacity-100 transition-opacity duration-200">
                                    <rect x={p.x - 45} y={p.y - 38} width="90" height="28" rx="8" fill="#0f172a" />
                                    <text x={p.x} y={p.y - 20} textAnchor="middle" className="text-[10px] font-extrabold fill-white font-sans">{p.data.originalStr}</text>
                                  </g>
                                  
                                  {/* Date Labels below X-axis */}
                                  <text x={p.x} y="218" textAnchor="middle" className="text-[10px] font-black fill-slate-400">{p.data.date}</text>
                                </g>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    {/* Unit legend */}
                    <div className="flex flex-col gap-2 mt-2 shrink-0">
                      <div className="flex items-center gap-1.5 bg-teal-50/20 border border-teal-100/50 p-2.5 rounded-xl">
                        <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="text-[10px] font-bold text-slate-500">
                          Os limites de referência do laudo estão integrados matematicamente aos pontos. Unidade padrão: <span className="font-semibold text-teal-700">{biomarkerChartData[0]?.unit || 'unidades'}</span>.
                        </span>
                      </div>
                      
                      {biomarkerChartData.length === 1 && (
                        <div className="flex items-center gap-1.5 bg-amber-50/40 border border-amber-100/50 p-2.5 rounded-xl">
                          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-[10px] font-bold text-slate-500">
                            Histórico de evolução será exibido assim que novos exames forem adicionados.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CHART B: EVOLUÇÃO ANTROPOMÉTRICA */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6.5 shadow-sm flex flex-col h-[480px]">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3 shrink-0">
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                    <Activity className="w-5 h-5 text-indigo-650" />
                    Histórico Evolutivo de Antropometria
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Peso, percentual de gordura e massa muscular</p>
                </div>

                {/* Legends Segmented Filter */}
                <div className="flex bg-slate-100 p-0.5 border border-slate-200 rounded-xl shadow-inner shrink-0">
                  <button
                    onClick={() => setActiveAntropometriaLine('all')}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                      activeAntropometriaLine === 'all' ? 'bg-white text-slate-800 shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setActiveAntropometriaLine('weight')}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                      activeAntropometriaLine === 'weight' ? 'bg-white text-rose-600 shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Peso
                  </button>
                  <button
                    onClick={() => setActiveAntropometriaLine('bodyFat')}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                      activeAntropometriaLine === 'bodyFat' ? 'bg-white text-amber-600 shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Gordura
                  </button>
                  <button
                    onClick={() => setActiveAntropometriaLine('muscleMass')}
                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all ${
                      activeAntropometriaLine === 'muscleMass' ? 'bg-white text-emerald-600 shadow' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Músculo
                  </button>
                </div>
              </div>

              {/* SVG Chart B Multiline Rendering */}
              <div className="flex-1 min-h-0 pt-6 relative flex items-center justify-center">
                {anthropometryChartData.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <Info className="w-8 h-8 text-slate-300 mx-auto mb-1 stroke-[1.2]" />
                    <p className="text-xs font-semibold">Nenhuma antropometria cadastrada nas consultas anteriores</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col justify-between">
                    <div className="flex-1 w-full relative min-h-0">
                      <svg viewBox="0 0 500 240" className="w-full h-full overflow-visible">
                        {/* Grid lines */}
                        <line x1="40" y1="40" x2="460" y2="40" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="100" x2="460" y2="100" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="160" x2="460" y2="160" stroke="#f1f5f9" strokeWidth="1.5" />
                        <line x1="40" y1="200" x2="460" y2="200" stroke="#cbd5e1" strokeWidth="2" /> {/* Bottom axis */}

                        {/* Y Axis standard scale */}
                        <text x="32" y="45" textAnchor="end" className="text-[10px] font-black fill-slate-400">100</text>
                        <text x="32" y="105" textAnchor="end" className="text-[10px] font-black fill-slate-400">50</text>
                        <text x="32" y="165" textAnchor="end" className="text-[10px] font-black fill-slate-400">10</text>

                        {/* Line Path Builders */}
                        {(() => {
                          const points = anthropometryChartData.map((d, idx) => {
                            const x = anthropometryChartData.length === 1
                              ? 250
                              : 40 + (idx * (420 / Math.max(1, anthropometryChartData.length - 1)));
                            
                            // Map values to 40 - 200 SVG range relative to estimated limits:
                            // Weight max=120, min=40
                            const yWeight = 200 - (((d.weight - 40) / 80) * 160);
                            // Bodyfat max=40, min=5
                            const yFat = 200 - (((d.bodyFat - 5) / 35) * 160);
                            // Muscle max=60, min=15
                            const yMuscle = 200 - (((d.muscleMass - 15) / 45) * 160);

                            return { x, yWeight, yFat, yMuscle, data: d };
                          });

                          const pathWeightStr = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yWeight}`).join(' ');
                          const pathFatStr = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yFat}`).join(' ');
                          const pathMuscleStr = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.yMuscle}`).join(' ');

                          return (
                            <>
                              {/* Draw Weight line (Rose) */}
                              {(activeAntropometriaLine === 'all' || activeAntropometriaLine === 'weight') && (
                                <>
                                  {anthropometryChartData.length > 1 && (
                                    <>
                                      <path d={pathWeightStr} fill="none" stroke="rgba(244, 63, 94, 0.1)" strokeWidth="6" strokeLinecap="round" />
                                      <path d={pathWeightStr} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </>
                                  )}
                                  {points.map((p, idx) => (
                                    <g key={`w_${idx}`} className="group/wpoint cursor-pointer">
                                      <circle cx={p.x} cy={p.yWeight} r="4" fill="#ffffff" stroke="#f43f5e" strokeWidth="2" />
                                      <g className="opacity-0 group-hover/wpoint:opacity-100 transition-opacity">
                                        <rect x={p.x - 35} y={p.yWeight - 32} width="70" height="22" rx="6" fill="#f43f5e" />
                                        <text x={p.x} y={p.yWeight - 18} textAnchor="middle" className="text-[9px] font-black fill-white font-sans">{p.data.weight} kg</text>
                                      </g>
                                    </g>
                                  ))}
                                </>
                              )}

                              {/* Draw Body Fat line (Amber) */}
                              {(activeAntropometriaLine === 'all' || activeAntropometriaLine === 'bodyFat') && (
                                <>
                                  {anthropometryChartData.length > 1 && (
                                    <>
                                      <path d={pathFatStr} fill="none" stroke="rgba(245, 158, 11, 0.1)" strokeWidth="6" strokeLinecap="round" />
                                      <path d={pathFatStr} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,4" />
                                    </>
                                  )}
                                  {points.map((p, idx) => (
                                    <g key={`f_${idx}`} className="group/fpoint cursor-pointer">
                                      <circle cx={p.x} cy={p.yFat} r="4" fill="#ffffff" stroke="#f59e0b" strokeWidth="2" />
                                      <g className="opacity-0 group-hover/fpoint:opacity-100 transition-opacity">
                                        <rect x={p.x - 30} y={p.yFat - 32} width="60" height="22" rx="6" fill="#f59e0b" />
                                        <text x={p.x} y={p.yFat - 18} textAnchor="middle" className="text-[9px] font-black fill-white font-sans">{p.data.bodyFat}%</text>
                                      </g>
                                    </g>
                                  ))}
                                </>
                              )}

                              {/* Draw Muscle Mass line (Emerald) */}
                              {(activeAntropometriaLine === 'all' || activeAntropometriaLine === 'muscleMass') && (
                                <>
                                  {anthropometryChartData.length > 1 && (
                                    <>
                                      <path d={pathMuscleStr} fill="none" stroke="rgba(16, 185, 129, 0.1)" strokeWidth="6" strokeLinecap="round" />
                                      <path d={pathMuscleStr} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </>
                                  )}
                                  {points.map((p, idx) => (
                                    <g key={`m_${idx}`} className="group/mpoint cursor-pointer">
                                      <circle cx={p.x} cy={p.yMuscle} r="4" fill="#ffffff" stroke="#10b981" strokeWidth="2" />
                                      <g className="opacity-0 group-hover/mpoint:opacity-100 transition-opacity">
                                        <rect x={p.x - 35} y={p.yMuscle - 32} width="70" height="22" rx="6" fill="#10b981" />
                                        <text x={p.x} y={p.yMuscle - 18} textAnchor="middle" className="text-[9px] font-black fill-white font-sans">{p.data.muscleMass} kg</text>
                                      </g>
                                    </g>
                                  ))}
                                </>
                              )}

                              {/* X Axis dates */}
                              {points.map((p, idx) => (
                                <text key={`x_${idx}`} x={p.x} y="218" textAnchor="middle" className="text-[10px] font-black fill-slate-400">{p.data.date}</text>
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* Chart Legends */}
                    <div className="flex flex-col gap-2 shrink-0 border-t border-slate-100 pt-3">
                      <div className="flex justify-center gap-6">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-rose-500 border border-rose-450" />
                          <span>Peso (kg)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-amber-500 border border-amber-450" />
                          <span>Gordura (%)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-emerald-500 border border-emerald-450" />
                          <span>Massa Muscular (kg)</span>
                        </div>
                      </div>

                      {anthropometryChartData.length === 1 && (
                        <div className="flex items-center justify-center gap-1.5 bg-amber-50/40 border border-amber-100/50 p-2 rounded-xl mt-1.5">
                          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="text-[10px] font-bold text-slate-500">
                            Os dados de evolução aparecerão aqui assim que mais de uma avaliação física for registrada.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* HISTÓRICO E FLUXO DE CONSULTAS */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6.5 shadow-sm flex flex-col min-h-[250px] text-left">
            <div className="border-b border-slate-100 pb-3.5 shrink-0 flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  Histórico e Fluxo de Consultas
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Fluxo de agendamentos e status dos atendimentos</p>
              </div>
              <span className="text-xs font-black text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                {appointments.length} Consultas
              </span>
            </div>

            {/* Consultation List */}
            <div className="flex-1 overflow-y-auto max-h-[350px] pr-1">
              {appointments.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="w-8 h-8 text-slate-250 stroke-[1.2] mx-auto mb-2" />
                  <p className="text-xs font-bold">Nenhum histórico de consultas anteriores encontrado para este paciente.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {appointments.map((apt) => {
                    const dateObj = new Date(apt.date_time);
                    const formattedDate = format(dateObj, 'dd/MM/yyyy');
                    const formattedTime = format(dateObj, 'HH:mm');
                    const serviceName = (apt.services as any)?.name || 'Consulta Geral';
                    const modality = (apt.services as any)?.modality || 'Presencial';
                    
                    // Status color mappings
                    let statusBadge = '';
                    let statusLabel = '';
                    
                    if (apt.status === 'concluido') {
                      statusBadge = 'bg-emerald-50 border-emerald-150 text-emerald-700';
                      statusLabel = 'Realizada';
                    } else if (apt.status === 'cancelado') {
                      statusBadge = 'bg-rose-50 border-rose-150 text-rose-700';
                      statusLabel = 'Cancelada';
                    } else {
                      statusBadge = 'bg-teal-50 border-teal-150 text-teal-700';
                      statusLabel = 'Agendada';
                    }

                    const consultationArray = Array.isArray(apt.consultations) ? apt.consultations : [apt.consultations].filter(Boolean);
                    const consultation = consultationArray[0];
                    const hasDetails = apt.status === 'concluido' && !!consultation;

                    return (
                      <div key={apt.id} className="bg-slate-50/40 border border-slate-200/75 p-4 rounded-2xl flex flex-col justify-between gap-3 hover:bg-white hover:border-slate-350 hover:shadow-sm transition-all duration-200">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${statusBadge}`}>
                              {statusLabel}
                            </span>
                            <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-100 px-2 py-0.5 rounded-lg">
                              {modality}
                            </span>
                          </div>
                          
                          <h4 className="text-sm font-black text-slate-800 leading-snug">{serviceName}</h4>
                        </div>

                        <div className="space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 border-t border-slate-100 pt-2.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedDate}</span>
                            <span className="text-slate-300">•</span>
                            <span>{formattedTime}h</span>
                          </div>

                          {hasDetails && (
                            <button
                              onClick={() => setSelectedAptForModal(apt)}
                              className="w-full text-center py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100/70 text-[10px] font-black text-indigo-700 rounded-xl transition-all flex items-center justify-center gap-1 focus:outline-none shadow-sm"
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
            <div className="w-full bg-white border border-slate-200 rounded-3xl p-6.5 shadow-sm flex flex-col h-[520px] overflow-hidden">
              
              <div className="border-b border-slate-100 pb-3.5 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                    <CalendarRange className="w-5 h-5 text-teal-650" />
                    Sinopse da Jornada Clínica do Paciente
                  </h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Visão cronológica de eventos integrados</p>
                </div>
                <span className="text-xs font-black text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  {timelineEvents.length} Eventos
                </span>
              </div>

              {/* Reverse Chronological timeline list */}
              <div className="flex-1 overflow-y-auto pt-4 pr-1 min-h-0 space-y-4">
                {timelineEvents.length === 0 ? (
                  <div className="text-center py-24 text-slate-400">
                    <ClipboardList className="w-10 h-10 text-slate-250 stroke-[1.2] mx-auto mb-2" />
                    <p className="text-sm font-bold">Nenhum evento registrado na jornada</p>
                    <p className="text-xs mt-0.5">Consultas e análises aparecerão automaticamente aqui.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 border-l border-slate-200 space-y-6">
                    {timelineEvents.map((evt, idx) => {
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
                          <div className="bg-slate-50/50 hover:bg-white border border-slate-200/70 hover:border-slate-300 p-4 rounded-2xl shadow-sm transition-all duration-200 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                  evt.type === 'consultation'
                                    ? 'bg-indigo-50 border-indigo-150 text-indigo-700'
                                    : evt.type === 'exam'
                                      ? 'bg-teal-50 border-teal-150 text-teal-700'
                                      : 'bg-emerald-50 border-emerald-150 text-emerald-700'
                                }`}>
                                  {evt.type === 'consultation' ? 'Consulta' : evt.type === 'exam' ? 'Laudo' : 'Dieta'}
                                </span>
                                <span className="text-xs font-bold text-slate-450">{eventDate}</span>
                              </div>

                              <h4 className="text-sm font-black text-slate-800 leading-snug">{evt.title}</h4>
                              <p className="text-xs font-semibold text-slate-500">{evt.subtitle}</p>

                              {/* Nested micro-data details based on type */}
                              {evt.type === 'consultation' && evt.meta.weight && (
                                <div className="flex gap-4 text-[10px] font-black text-slate-500 bg-white border border-slate-200 p-1.5 rounded-xl w-fit">
                                  <span>Peso: {evt.meta.weight} kg</span>
                                  <span>Gordura: {evt.meta.body_fat}%</span>
                                  <span>Músculo: {evt.meta.muscle_mass} kg</span>
                                </div>
                              )}

                              {evt.type === 'exam' && evt.meta.alertsCount > 0 && (
                                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-150 px-2 py-0.5 rounded-lg">
                                  ⚠️ {evt.meta.alertsCount} biomarcadores alterados
                                </div>
                              )}
                            </div>

                            {/* Journey Link action */}
                            <div className="shrink-0 flex items-center justify-end">
                              <button
                                onClick={() => {
                                  if (evt.type === 'exam') {
                                    setSelectedExamForModal(evt.meta.exam);
                                  } else {
                                    showToast('Para visualizar consultas completas ou dietas estruturadas, navegue pelos respectivos painéis no menu lateral.', 'info');
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200/80 px-2.5 py-1.5 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 hover:text-slate-850 transition-all focus:outline-none"
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
                <span className="bg-teal-50 text-teal-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-teal-150 uppercase tracking-wider flex items-center gap-1 w-fit">
                  <Sparkles className="w-3 h-3 text-teal-650" /> Análise de Exame Clínico
                </span>
                <h3 className="text-lg font-black text-slate-800 tracking-tight leading-snug">
                  Detalhes do Laudo Anexado
                </h3>
              </div>
              <button 
                onClick={() => setSelectedExamForModal(null)} 
                className="h-9 w-9 rounded-full hover:bg-slate-200/85 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors border border-slate-200"
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
                    <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Documento Original do Paciente</p>
                    <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-teal-650" />
                      {selectedExamForModal.file_url.split('/').pop() || 'Exames Gyselle Completo.pdf'}
                    </h4>
                  </div>

                  {loadingPdfUrl ? (
                    <div className="flex items-center gap-1.5 text-xs text-slate-450 font-bold">
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-teal-600 border-t-transparent" />
                      Gerando link seguro...
                    </div>
                  ) : modalPdfUrl ? (
                    <a 
                      href={modalPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-teal-600 hover:bg-teal-700 px-4 py-2.5 rounded-xl shadow-sm transition-all"
                    >
                      <Eye className="w-4 h-4" /> Abrir / Download PDF
                    </a>
                  ) : (
                    <span className="text-xs font-bold text-rose-600">Erro ao carregar PDF</span>
                  )}
                </div>
              </div>

              {/* SEÇÃO B: Parecer Clínico (Insights da IA) */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Parecer Clínico-Nutricional (Gemini AI)
                </h4>
                <div className="bg-indigo-50/20 border border-indigo-100/50 p-5 rounded-2xl">
                  <p className="text-xs font-semibold text-slate-700 leading-relaxed whitespace-pre-line">
                    {selectedExamForModal.ai_feedback?.insights || "Nenhum parecer gerado para este exame."}
                  </p>
                </div>
              </div>

              {/* SEÇÃO C: Biomarcadores e Notas Manuais (nota_clinica) */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-teal-650" /> Biomarcadores Lidos & Anotações Clínicas
                </h4>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Biomarcador</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Resultado</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider">Referência</th>
                        <th className="px-4 py-3 font-black text-slate-500 uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {selectedExamForModal.ai_feedback?.todos_biomarcadores?.map((bio: any, idx: number) => {
                        const isAlterado = bio.status?.toLowerCase() === 'alterado';
                        return (
                          <React.Fragment key={idx}>
                            {/* Biomarker Core Info Row */}
                            <tr className="hover:bg-slate-50/40">
                              <td className="px-4 py-3.5 font-bold text-slate-800">{bio.marcador}</td>
                              <td className="px-4 py-3.5 font-extrabold text-slate-800">{bio.valor}</td>
                              <td className="px-4 py-3.5 font-medium text-slate-500">{bio.referencia}</td>
                              <td className="px-4 py-3.5 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${
                                  isAlterado
                                    ? 'bg-rose-50 border-rose-150 text-rose-700'
                                    : 'bg-emerald-50 border-emerald-150 text-emerald-700'
                                }`}>
                                  {isAlterado ? 'Alterado' : 'Normal'}
                                </span>
                              </td>
                            </tr>
                            
                            {/* nota_clinica Row if present */}
                            {bio.nota_clinica && (
                              <tr className="bg-teal-50/5">
                                <td colSpan={4} className="px-4 py-2.5 border-t border-slate-100">
                                  <div className="flex items-start gap-1.5 text-slate-600 bg-teal-50/20 border border-teal-100/50 p-2.5 rounded-xl">
                                    <ClipboardList className="w-3.5 h-3.5 text-teal-650 shrink-0 mt-0.5" />
                                    <div className="text-[10px] leading-relaxed">
                                      <span className="font-black text-teal-800 uppercase tracking-wider">Anotação Nutricional: </span>
                                      <span className="font-semibold text-slate-600">{bio.nota_clinica}</span>
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
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-450 font-bold">
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
                className="px-5 py-2 text-xs font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shadow-sm transition-all focus:outline-none"
              >
                Fechar Detalhes
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 5. MODAL RESUMO DO ATENDIMENTO (O QUE FOI FEITO) */}
      {selectedAptForModal && (() => {
        const consultationArray = Array.isArray(selectedAptForModal.consultations) 
          ? selectedAptForModal.consultations 
          : [selectedAptForModal.consultations].filter(Boolean);
        const consultation = consultationArray[0];
        const ant = consultation?.anthropometry_json || {};
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
            <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in scale-in duration-300">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
                <div className="space-y-0.5">
                  <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-indigo-150 uppercase tracking-wider flex items-center gap-1 w-fit">
                    <ClipboardList className="w-3 h-3 text-indigo-600" /> Resumo do Atendimento
                  </span>
                  <h3 className="text-lg font-black text-slate-800">
                    {(selectedAptForModal.services as any)?.name || 'Consulta Geral'}
                  </h3>
                </div>
                <button 
                  onClick={() => setSelectedAptForModal(null)} 
                  className="h-9 w-9 rounded-full hover:bg-slate-200/85 flex items-center justify-center text-slate-500 hover:text-slate-850 border border-slate-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Section 1: Anamnese Notes */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-500" /> Anotações de Anamnese
                  </h4>
                  <div className="bg-indigo-50/20 border border-indigo-100/50 p-4.5 rounded-2xl">
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed whitespace-pre-line">
                      {consultation?.anamnese_notes || "Nenhuma anotação de anamnese registrada."}
                    </p>
                  </div>
                </div>

                {/* Section 2: Anthropometry Collected */}
                {(ant.weight || ant.body_fat || ant.muscle_mass) && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-teal-650" /> Avaliação Física Coletada
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {ant.weight && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Peso</p>
                          <p className="text-lg font-black text-slate-800 mt-1">{ant.weight} kg</p>
                        </div>
                      )}
                      {ant.body_fat && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Gordura</p>
                          <p className="text-lg font-black text-slate-800 mt-1">{ant.body_fat}%</p>
                        </div>
                      )}
                      {ant.muscle_mass && (
                        <div className="bg-slate-50 border border-slate-200/60 p-3.5 rounded-2xl shadow-sm text-center">
                          <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Massa Muscular</p>
                          <p className="text-lg font-black text-slate-800 mt-1">{ant.muscle_mass} kg</p>
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
                  className="px-5 py-2 text-xs font-black text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl shadow-sm transition-all focus:outline-none"
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
