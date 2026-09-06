import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  FileText,
  Search,
  Calendar as CalendarIcon,
  Clock,
  User,
  Filter,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  History,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Edit,
  Save,
  ArrowLeft,
  UploadCloud,
  Eye,
  Copy
} from 'lucide-react';
import { format, isSameDay, isToday, parseISO, addDays, subDays, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { applyBiomarkerNote } from '../utils/biomarkers';
import { analyzeExamPdf, blobToBase64, GeminiError } from '../lib/gemini';
import { createExamSignedUrl, uploadExamFile, removeExamFile } from '../lib/storage';
import { AiAnalysisPanel } from '../components/exams/AiAnalysisPanel';
import { ExamHistoryList } from '../components/exams/ExamHistoryList';
import { AppointmentList } from '../components/consultations/AppointmentList';
import { StatusBadge } from '../components/consultations/StatusBadge';
import { ConsultationForm, type ConsultationFormHandle } from '../components/consultations/ConsultationForm';
import { logger } from '../lib/logger';
import { pickOne } from '../types/clinical';
import type {
  ClinicProfessional,
  ConsultationAppointment,
  ExamBiomarker,
  ExamRecord,
  PastConsultation,
  ServiceLite,
  AnthropometryJson,
} from '../types/clinical';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : '');


export const Consultations: React.FC = () => {
  const { clinic, isReadOnly, profile } = useAuth();
  const { showToast } = useToast();

  // Search & Filter state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  
  // Data loading state
  const [appointments, setAppointments] = useState<ConsultationAppointment[]>([]);
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [professionals, setProfessionals] = useState<ClinicProfessional[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Detail State
  const [selectedAppointment, setSelectedAppointment] = useState<ConsultationAppointment | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'history' | 'form' | 'exams'>('profile');
  const [pastConsultations, setPastConsultations] = useState<PastConsultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Lab Exams State
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExam, setSelectedExam] = useState<ExamRecord | null>(null);
  const [uploadingExam, setUploadingExam] = useState(false);
  const [analyzingExam, setAnalyzingExam] = useState(false);
  const [selectedExamSignedUrl, setSelectedExamSignedUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ai_feedback já vem em `exams` (select *) — parecer/alertas/biomarcadores são
  // DERIVADOS do exame selecionado (PERF-04: sem useEffect que rebusca esse campo).
  const alteracoesCriticas: ExamBiomarker[] | null = selectedExam?.ai_feedback?.alertas ?? null;
  const parecerClinico: string | null = selectedExam?.ai_feedback?.insights ?? null;

  // Observações e Anotações Clínicas
  const handleSaveBiomarkerNote = async (idx: number, text: string) => {
    if (!selectedExam) return;
    const updatedFeedback = applyBiomarkerNote(selectedExam.ai_feedback ?? null, idx, text);
    try {
      const { error: dbError } = await supabase
        .from('patient_exams')
        .update({ ai_feedback: updatedFeedback })
        .eq('id', selectedExam.id);
      if (dbError) throw dbError;

      const updatedExam: ExamRecord = { ...selectedExam, ai_feedback: updatedFeedback };
      setSelectedExam(updatedExam);
      setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));
      showToast('Observação clínica salva com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro ao salvar nota do biomarcador:', err);
      showToast('Erro ao salvar observação clínica.', 'error');
    }
  };

  // Editing Clinical Data State (aba Dados do Paciente)
  const [isEditingClinical, setIsEditingClinical] = useState(false);
  const [savingClinical, setSavingClinical] = useState(false);
  const [clinicalForm, setClinicalForm] = useState({
    allergies: '',
    dietary_restrictions: '',
    pathologies: '',
    medications: '',
    physical_activity_level: '',
    profession: '',
    sleep_quality: ''
  });

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    if (!clinic?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id,
          date_time,
          status,
          clinic_id,
          patient_id,
          nutritionist_id,
          service_id,
          patients ( 
            id, 
            name, 
            email, 
            phone, 
            cpf, 
            birth_date, 
            biological_sex, 
            main_goal,
            allergies,
            dietary_restrictions,
            pathologies,
            medications,
            physical_activity_level,
            profession,
            sleep_quality
          ),
          services ( id, name, duration_minutes, price )
        `)
        .eq('clinic_id', clinic.id)
        .order('date_time', { ascending: true });

      if (error) throw error;
      setAppointments((data ?? []) as unknown as ConsultationAppointment[]);
    } catch (err) {
      logger.error('Erro ao buscar agendamentos:', err);
      showToast('Falha ao carregar agendamentos do banco de dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [clinic?.id, showToast]);

  // Fetch services for filtering
  const fetchServices = useCallback(async () => {
    if (!clinic?.id) return;
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('clinic_id', clinic.id)
        .order('name');
      if (!error && data) {
        setServices(data as ServiceLite[]);
      }
    } catch (err) {
      logger.error('Erro ao carregar serviços:', err);
    }
  }, [clinic?.id]);

  // Fetch professionals for listing and validation (PERF-06: 1 query com join,
  // antes eram 2 requisições encadeadas clinic_members -> profiles.in).
  const fetchProfessionals = useCallback(async () => {
    if (!clinic?.id) return;
    try {
      const { data, error } = await supabase
        .from('clinic_members')
        .select('role, profiles!inner ( id, full_name, avatar_url, is_active )')
        .eq('clinic_id', clinic.id);

      if (error) throw error;
      const mapped: ClinicProfessional[] = (data ?? []).map((m) => {
        const p = pickOne(m.profiles) ?? ({} as Partial<ClinicProfessional>);
        return { ...p, role: m.role || 'nutritionist' } as ClinicProfessional;
      }).filter((p) => p.is_active !== false);
      setProfessionals(mapped);
    } catch (err) {
      logger.error('Erro ao carregar profissionais:', err);
    }
  }, [clinic?.id]);

  const fetchPatientHistory = useCallback(async (selectedPacienteId: string) => {
    if (!clinic?.id || !selectedPacienteId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('consultations')
        .select(`
          id,
          anamnese_notes,
          anthropometry_json,
          created_at,
          appointment_id,
          appointments!inner (
            status,
            date_time,
            services ( name )
          )
        `)
        .eq('patient_id', selectedPacienteId)
        .neq('appointments.status', 'Cancelado')
        .neq('appointments.status', 'cancelado')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPastConsultations((data ?? []) as unknown as PastConsultation[]);
    } catch (err) {
      logger.error('Erro ao buscar histórico de consultas:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [clinic?.id]);

  // Lab Exams Functions
  const fetchPatientExams = useCallback(async (patientId: string) => {
    if (!patientId) return;
    setLoadingExams(true);
    try {
      const { data, error } = await supabase
        .from('patient_exams')
        .select('*')
        .eq('patient_id', patientId)
        .order('exam_date', { ascending: false });

      if (error) throw error;
      setExams((data ?? []) as ExamRecord[]);
    } catch (err) {
      logger.error('Erro ao buscar exames:', err);
      showToast('Falha ao carregar histórico de exames.', 'error');
    } finally {
      setLoadingExams(false);
    }
  }, [showToast]);

  const selectedExamIdRef = useRef<string | null>(null);
  const consultationFormRef = useRef<ConsultationFormHandle>(null);

  const handleSelectExam = async (exam: ExamRecord | null) => {
    selectedExamIdRef.current = exam?.id ?? null;
    setSelectedExam(exam);
    setSelectedExamSignedUrl(null);
    if (!exam) return;

    try {
      const signedUrl = await createExamSignedUrl(exam.file_url);
      if (exam.id === selectedExamIdRef.current) {
        setSelectedExamSignedUrl(signedUrl);
      }
    } catch (err) {
      logger.error('Erro ao gerar URL assinada:', err);
      showToast('Não foi possível carregar o arquivo do exame.', 'error');
    }
  };

  const handleUploadExam = async (file: File) => {
    if (!selectedAppointment?.patients?.id || !profile?.id) {
      showToast('Paciente ou profissional não identificado.', 'error');
      return;
    }
    if (file.type !== 'application/pdf') {
      showToast('Apenas arquivos PDF são permitidos.', 'error');
      return;
    }

    setUploadingExam(true);
    showToast('Enviando arquivo do exame...', 'info');

    try {
      const patientId = selectedAppointment.patients.id;
      const { path: filePath } = await uploadExamFile(patientId, file);

      const { data: examData, error: insertError } = await supabase
        .from('patient_exams')
        .insert([{
          patient_id: patientId,
          professional_id: profile.id,
          file_url: filePath,
          exam_date: format(new Date(), 'yyyy-MM-dd')
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      showToast('Exame enviado com sucesso!', 'success');
      await fetchPatientExams(patientId);
      
      if (examData) {
        await handleSelectExam(examData);
      }
    } catch (err) {
      logger.error('Erro ao enviar exame:', err);
      showToast(errMessage(err) || 'Falha ao enviar arquivo do exame.', 'error');
    } finally {
      setUploadingExam(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await handleUploadExam(file);
    }
  };

  const handleDeleteExam = async (exam: ExamRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!window.confirm('Tem certeza que deseja excluir este exame permanentemente?')) return;

    try {
      await removeExamFile(exam.file_url);

      const { error: dbError } = await supabase
        .from('patient_exams')
        .delete()
        .eq('id', exam.id);

      if (dbError) throw dbError;

      showToast('Exame excluído com sucesso!', 'success');
      
      if (selectedExam?.id === exam.id) {
        setSelectedExam(null);
        setSelectedExamSignedUrl(null);
      }
      setExams(prev => prev.filter(e => e.id !== exam.id));
    } catch (err) {
      logger.error('Erro ao excluir exame:', err);
      showToast(errMessage(err) || 'Falha ao excluir o exame.', 'error');
    }
  };

  const handleAnalyzeExamWithAI = async () => {
    if (!selectedExam || !selectedExamSignedUrl) {
      showToast('Nenhum exame carregado ou link inválido.', 'error');
      return;
    }

    setAnalyzingExam(true);
    showToast('Analisando o exame com IA...', 'success');

    try {
      const fileResponse = await fetch(selectedExamSignedUrl);
      if (!fileResponse.ok) throw new Error('Não foi possível fazer download do PDF do storage.');
      const base64Data = await blobToBase64(await fileResponse.blob());

      const feedbackJSON = await analyzeExamPdf(base64Data);

      // Save to Database
      const { error: dbError } = await supabase
        .from('patient_exams')
        .update({ ai_feedback: feedbackJSON })
        .eq('id', selectedExam.id);

      if (dbError) throw dbError;

      const updatedExam = { ...selectedExam, ai_feedback: feedbackJSON };
      setSelectedExam(updatedExam);   // parecer/alertas/biomarcadores derivam daqui
      setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));

      showToast('Exame analisado com inteligência artificial com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro na análise de exames:', err);
      showToast(err instanceof GeminiError ? err.message : 'Erro ao analisar o exame.', 'error');
    } finally {
      setAnalyzingExam(false);
    }
  };

  const handleCopyAnalysisToConsultation = () => {
    if (!selectedExam || !parecerClinico) return;
    const alertas = alteracoesCriticas || [];
    const insights = parecerClinico;

    const formattedAlerts = alertas.map((a) =>
      `- **${a.marcador}:** ${a.valor} (Ref: ${a.referencia}) [Gravidade: ${(a.gravidade ?? '').toUpperCase()}]`
    ).join('\n');

    const fullAnalysisMarkdown = `\n\n### 🔬 ANÁLISE DE EXAMES LABORATORIAIS (${format(new Date(selectedExam.exam_date ?? selectedExam.created_at), "dd/MM/yyyy")})
    
**Biomarcadores Alterados:**
${formattedAlerts || '- Nenhum biomarcador alterado detectado.'}

**Interpretação & Conduta Nutricional (Gemini AI):**
${insights}`;

    navigator.clipboard.writeText(fullAnalysisMarkdown.trim());
    consultationFormRef.current?.appendAnamnese(fullAnalysisMarkdown.trim());
    setActiveTab('form');
    showToast('Análise copiada e injetada com sucesso no prontuário ativo!', 'success');
  };

  useEffect(() => {
    if (clinic?.id) {
      fetchAppointments();
      fetchServices();
      fetchProfessionals();
    }
  }, [clinic?.id, fetchAppointments, fetchServices, fetchProfessionals]);

  // Ao selecionar/trocar de agendamento: histórico + exames + ficha clínica.
  // O estado do formulário de atendimento vive em <ConsultationForm/> (PERF-11).
  useEffect(() => {
    if (selectedAppointment?.patients?.id) {
      fetchPatientHistory(selectedAppointment.patients.id);
      setSelectedExam(null);
      setSelectedExamSignedUrl(null);
      fetchPatientExams(selectedAppointment.patients.id);

      setActiveTab('profile');
      setIsEditingClinical(false);

      const p = selectedAppointment.patients;
      setClinicalForm({
        allergies: p.allergies || '',
        dietary_restrictions: p.dietary_restrictions || '',
        pathologies: p.pathologies || '',
        medications: p.medications || '',
        physical_activity_level: p.physical_activity_level || '',
        profession: p.profession || '',
        sleep_quality: p.sleep_quality || ''
      });
    }
    // PERF-05: DELIBERADAMENTE só re-roda ao trocar de agendamento ou mudar o
    // status — não ao mutar campos de `patients` (ex.: salvar ficha clínica),
    // senão o histórico/exames seriam rebuscados e a aba voltaria para 'profile'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppointment?.id, selectedAppointment?.status]);

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter(apt => {
      // 1. Date Match
      const matchesDate = isSameDay(new Date(apt.date_time), selectedDate);
      if (!matchesDate) return false;

      // 2. Search Term Match
      const patientName = apt.patients?.name || '';
      const serviceName = apt.services?.name || '';
      const matchesSearch = patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            serviceName.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // 3. Service Filter
      if (serviceFilter !== 'all' && apt.service_id !== serviceFilter) return false;

      // 4. Professional filter
      if (profile && !profile.is_superadmin && apt.nutritionist_id !== profile.id) {
        return false;
      }

      return true;
    });
  }, [appointments, selectedDate, searchTerm, serviceFilter, profile]);

  // Abrir um agendamento do grid (com checagem de responsável).
  const handleOpenAppointment = (apt: ConsultationAppointment) => {
    if (apt.status !== 'concluido' && profile?.id !== apt.nutritionist_id) {
      showToast('Apenas o profissional responsável por esta consulta pode iniciá-la.', 'error');
      return;
    }
    setSelectedAppointment(apt);
  };

  // Pós-finalização do atendimento (disparado por <ConsultationForm/>).
  const handleConsultationFinalized = async () => {
    await fetchAppointments();
    setSelectedAppointment((prev) => (prev ? { ...prev, status: 'concluido' } : null));
    if (selectedAppointment?.patient_id) await fetchPatientHistory(selectedAppointment.patient_id);
    setActiveTab('history');
  };

  // Save the modified Clinical Data
  const handleSaveClinicalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!selectedAppointment?.patients?.id) return;
    const targetPatientId = selectedAppointment.patients.id;

    setSavingClinical(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          allergies: clinicalForm.allergies,
          dietary_restrictions: clinicalForm.dietary_restrictions,
          pathologies: clinicalForm.pathologies,
          medications: clinicalForm.medications,
          physical_activity_level: clinicalForm.physical_activity_level,
          profession: clinicalForm.profession,
          sleep_quality: clinicalForm.sleep_quality
        })
        .eq('id', targetPatientId);

      if (error) throw error;

      showToast('Ficha Clínica atualizada com sucesso!', 'success');

      setSelectedAppointment((prev) => {
        if (!prev || !prev.patients) return prev;
        return {
          ...prev,
          patients: {
            ...prev.patients,
            allergies: clinicalForm.allergies,
            dietary_restrictions: clinicalForm.dietary_restrictions,
            pathologies: clinicalForm.pathologies,
            medications: clinicalForm.medications,
            physical_activity_level: clinicalForm.physical_activity_level,
            profession: clinicalForm.profession,
            sleep_quality: clinicalForm.sleep_quality
          }
        };
      });

      setAppointments(prev => prev.map(apt => {
        if (apt.patients?.id === targetPatientId) {
          return {
            ...apt,
            patients: {
              ...apt.patients,
              allergies: clinicalForm.allergies,
              dietary_restrictions: clinicalForm.dietary_restrictions,
              pathologies: clinicalForm.pathologies,
              medications: clinicalForm.medications,
              physical_activity_level: clinicalForm.physical_activity_level,
              profession: clinicalForm.profession,
              sleep_quality: clinicalForm.sleep_quality
            }
          };
        }
        return apt;
      }));

      setIsEditingClinical(false);
    } catch (err) {
      logger.error('Erro ao salvar ficha clínica:', err);
      showToast(errMessage(err) || 'Erro ao salvar a ficha clínica no banco de dados.', 'error');
    } finally {
      setSavingClinical(false);
    }
  };



  // Helper: calculate age
  const getPatientAge = (birthDateStr: string | null | undefined) => {
    if (!birthDateStr) return 'Não informada';
    try {
      const birth = parseISO(birthDateStr);
      const age = differenceInYears(new Date(), birth);
      return `${age} anos`;
    } catch {
      return 'Não informada';
    }
  };


  const handlePrevDay = () => setSelectedDate(prev => subDays(prev, 1));
  const handleNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const handleToday = () => setSelectedDate(new Date());

  const stats = useMemo(() => {
    const dayAppts = appointments.filter(apt => isSameDay(new Date(apt.date_time), selectedDate));
    return {
      total: dayAppts.length,
      concluded: dayAppts.filter(a => a.status === 'concluido').length,
      pending: dayAppts.filter(a => a.status === 'pendente' || a.status === 'confirmado').length
    };
  }, [appointments, selectedDate]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 flex flex-col h-full font-sans pb-10">
      
      {/* 1. TOP HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Consultas & Prontuários
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Realize atendimentos diários, registre a composição corporal do paciente e utilize transcrição de áudio com inteligência artificial.
          </p>
        </div>
      </div>

      {/* 2. STATS & CONTROL ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow transition-shadow">
          <div className="p-3 bg-primary-50 rounded-xl">
            <CalendarIcon className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Agendas do Dia</p>
            <p className="text-2xl font-black text-slate-800">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow transition-shadow">
          <div className="p-3 bg-emerald-50 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Atendimentos Concluídos</p>
            <p className="text-2xl font-black text-emerald-600">{stats.concluded}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow transition-shadow">
          <div className="p-3 bg-amber-50 rounded-xl">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendentes / Confirmados</p>
            <p className="text-2xl font-black text-amber-600">{stats.pending}</p>
          </div>
        </div>
      </div>

      {/* 3. MULTI-VIEW WORKSPACE: DASHBOARD OR DISTRACTION-FREE WORKSPACE */}
      {!selectedAppointment ? (
        
        /* ---------------- VIEW A: SPACIOUS SCHEDULE DASHBOARD ---------------- */
        <div className="flex flex-col lg:flex-row gap-6 items-start animate-in fade-in duration-300 text-left">
          
          {/* Left Column: Calendar & Filter Sidebar */}
          <div className="w-full lg:w-80 shrink-0 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            
            {/* Title / Description Inside Sidebar */}
            <div className="space-y-1">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-primary-500" />
                Data Selecionada
              </h3>
              
              {/* Date display & navigations */}
              <div className="flex flex-col gap-3 pt-1">
                <h4 className="text-sm font-black text-slate-800">
                  {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </h4>
                
                <div className="flex items-center rounded-xl bg-slate-50 border border-slate-200 p-0.5 w-full">
                  <button 
                    onClick={handlePrevDay}
                    className="flex-1 p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-all flex justify-center shadow-none hover:shadow-sm"
                    title="Dia anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={handleToday}
                    className="flex-1 px-4 py-2 text-xs font-extrabold text-slate-700 hover:bg-white rounded-lg transition-all shadow-none hover:shadow-sm"
                  >
                    Hoje
                  </button>
                  <button 
                    onClick={handleNextDay}
                    className="flex-1 p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-all flex justify-center shadow-none hover:shadow-sm"
                    title="Próximo dia"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Filter and Search Section */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              {/* Search */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Busca de Paciente</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 pl-12 pr-4 py-2.5 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-xl text-xs font-normal text-slate-700 shadow-sm transition-all"
                  />
                </div>
              </div>

              {/* Procedure Filter */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Procedimento</label>
                <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 shadow-sm">
                  <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                  <select
                    value={serviceFilter}
                    onChange={e => setServiceFilter(e.target.value)}
                    className="text-xs font-normal text-slate-600 bg-transparent border-0 focus:outline-none cursor-pointer pr-4 w-full"
                  >
                    <option value="all">Todos Procedimentos</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Context/Info inside Sidebar */}
            <div className="p-4 bg-primary-50/50 rounded-2xl border border-primary-100/60 text-left">
              <p className="text-[11px] font-semibold text-primary-800 leading-relaxed">
                Selecione uma consulta ao lado para acessar a ficha de anamnese completa, registrar métricas corporais ou iniciar a gravação de áudio com transcrição inteligente.
              </p>
            </div>

          </div>

          {/* Right Column: Appointments Grid (Main Panel) */}
          <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
            
            {/* Header: Title and Counter */}
            <div className="p-5 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-4.5 h-4.5 text-primary-500" />
                Atendimentos Clínicos Agendados
                <span className="bg-primary-100 text-primary-800 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-primary-200">
                  {filteredAppointments.length} agendamento(s)
                </span>
              </h2>
              
              <span className="text-[10px] font-bold text-slate-400">
                {isToday(selectedDate) ? 'Hoje' : format(selectedDate, "dd/MM/yyyy")}
              </span>
            </div>

            {/* Spacious Appointments Grid Body */}
            <div className="p-6 bg-slate-50/20 flex-1">
              <AppointmentList
                appointments={filteredAppointments}
                professionals={professionals}
                currentUserId={profile?.id}
                loading={loading}
                selectedDate={selectedDate}
                onOpen={handleOpenAppointment}
              />
            </div>

          </div>

        </div>

      ) : (
        
        /* ---------------- VIEW B: DISTRACTION-FREE CLINICAL WORKSPACE (FULL WIDTH) ---------------- */
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-md overflow-hidden flex flex-col min-h-[600px] animate-in slide-in-from-bottom-4 duration-300">
          
          {/* distraction-free workspace header */}
          <div className="p-6 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-4">
              
              {/* BACK BUTTON TO SCHEDULE */}
              <button 
                onClick={() => setSelectedAppointment(null)}
                className="p-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl shadow-sm transition-all flex items-center justify-center shrink-0 group"
                title="Voltar para a Agenda"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              </button>

              <div className="h-14 w-14 bg-gradient-to-tr from-primary-500 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shadow-sm border border-primary-100 shrink-0">
                {(selectedAppointment.patients?.name ?? '').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-slate-900 leading-tight">
                    {selectedAppointment.patients?.name}
                  </h2>
                  <StatusBadge status={selectedAppointment.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 font-semibold">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Consulta das {format(new Date(selectedAppointment.date_time), 'HH:mm')} • {selectedAppointment.services?.name || 'Consulta Geral'}
                </p>
              </div>

            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400">Status atual:</span>
              {selectedAppointment.status === 'concluido' ? (
                <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-xl">Atendimento Concluído</span>
              ) : (
                <span className="text-xs font-extrabold text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1 rounded-xl">Em Atendimento</span>
              )}
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="flex border-b border-slate-200 px-6 bg-white shrink-0">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-3 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'profile' 
                  ? 'border-primary-500 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <User className="w-4 h-4" /> Dados do Paciente
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-3 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'history' 
                  ? 'border-primary-500 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <History className="w-4 h-4" /> Histórico Clínico ({pastConsultations.length})
            </button>
            <button
              onClick={() => setActiveTab('form')}
              className={`py-4 px-3 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'form' 
                  ? 'border-primary-500 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" /> Registrar Atendimento
            </button>
            <button
              onClick={() => setActiveTab('exams')}
              className={`py-4 px-3 border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
                activeTab === 'exams' 
                  ? 'border-primary-500 text-primary-600' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <ClipboardList className="w-4 h-4" /> Exames ({exams.length})
            </button>
          </div>

          {/* Workspace scrollable container */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40 min-h-0">
            
            {/* 3A. TAB: PROFILE INFO & ANAMNESE EDITOR */}
            {activeTab === 'profile' && selectedAppointment.patients && (
              <div className="space-y-6 animate-in fade-in duration-200 max-w-5xl mx-auto">
                
                {/* Patient identity details card */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-extrabold text-slate-800 font-sans">Informações Cadastrais</h3>
                    <span className="text-[10px] font-normal text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2.5 py-0.5">
                      {selectedAppointment.patients.main_goal || 'Reeducação Alimentar'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-mail</p>
                      {selectedAppointment.patients.email ? (
                        <p className="text-base font-normal text-slate-700 mt-1 truncate" title={selectedAppointment.patients.email}>{selectedAppointment.patients.email}</p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não cadastrado
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Telefone (WhatsApp)</p>
                      {selectedAppointment.patients.phone ? (
                        <p className="text-base font-normal text-slate-700 mt-1">{selectedAppointment.patients.phone}</p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não cadastrado
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">CPF</p>
                      {selectedAppointment.patients.cpf ? (
                        <p className="text-base font-normal text-slate-700 mt-1">{selectedAppointment.patients.cpf}</p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não cadastrado
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Idade</p>
                      {selectedAppointment.patients.birth_date ? (
                        <p className="text-base font-normal text-slate-700 mt-1">{getPatientAge(selectedAppointment.patients.birth_date)}</p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não informada
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sexo Biológico</p>
                      {selectedAppointment.patients.biological_sex ? (
                        <p className="text-base font-normal text-slate-700 mt-1">{selectedAppointment.patients.biological_sex === 'F' ? 'Feminino' : 'Masculino'}</p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não informado
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nascimento</p>
                      {selectedAppointment.patients.birth_date ? (
                        <p className="text-base font-normal text-slate-700 mt-1">
                          {format(parseISO(selectedAppointment.patients.birth_date), 'dd/MM/yyyy')}
                        </p>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 text-xs font-normal rounded-lg bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          Não informada
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* CLINICAL DATA AND HABITS EDITOR / DISPLAY CARD */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5 text-left">
                  
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-teal-600" />
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900">Ficha Clínica / Anamnese</h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Gestão de dados clínicos, restrições e hábitos do paciente</p>
                      </div>
                    </div>

                    {!isEditingClinical && (
                      <button
                        type="button"
                        onClick={() => {
                          const p = selectedAppointment?.patients;
                          if (!p) return;
                          setClinicalForm({
                            allergies: p.allergies || '',
                            dietary_restrictions: p.dietary_restrictions || '',
                            pathologies: p.pathologies || '',
                            medications: p.medications || '',
                            physical_activity_level: p.physical_activity_level || '',
                            profession: p.profession || '',
                            sleep_quality: p.sleep_quality || ''
                          });
                          setIsEditingClinical(true);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-extrabold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-100 px-3.5 py-1.5 rounded-xl shadow-sm transition-all animate-pulse-subtle"
                      >
                        <Edit className="w-3.5 h-3.5" /> Preencher Ficha
                      </button>
                    )}
                  </div>

                  {isEditingClinical ? (
                    /* PREMIUM FORM MATCHING THE ATTACHED IMAGE SCHEMA */
                    <form onSubmit={handleSaveClinicalData} className="space-y-6 animate-in fade-in duration-200">
                      
                      {/* DADOS CLÍNICOS E RESTRIÇÕES */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-teal-600 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-3.5 bg-teal-600 rounded-sm" />
                          Dados Clínicos e Restrições
                        </h4>
                        
                        <div className="space-y-3.5">
                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Alergias e Intolerâncias Alimentares</label>
                            <textarea
                              rows={2}
                              value={clinicalForm.allergies}
                              onChange={e => setClinicalForm({...clinicalForm, allergies: e.target.value})}
                              placeholder="Ex: Glúten, Lactose, Oleaginosas. Se não possuir, deixe em branco."
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Restrições Culturais ou Opções Alimentares</label>
                            <input
                              type="text"
                              value={clinicalForm.dietary_restrictions}
                              onChange={e => setClinicalForm({...clinicalForm, dietary_restrictions: e.target.value})}
                              placeholder="Ex: Vegano, Vegetariano, Kosher"
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Patologias ou Doenças Crônicas</label>
                            <textarea
                              rows={2}
                              value={clinicalForm.pathologies}
                              onChange={e => setClinicalForm({...clinicalForm, pathologies: e.target.value})}
                              placeholder="Ex: Diabetes Tipo 1/2, Hipertensão, Gastrite"
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Uso de Medicamentos / Suplementos Atuais</label>
                            <textarea
                              rows={2}
                              value={clinicalForm.medications}
                              onChange={e => setClinicalForm({...clinicalForm, medications: e.target.value})}
                              placeholder="Medicamentos e suplementos em uso"
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      {/* HÁBITOS E ESTILO DE VIDA */}
                      <div className="space-y-4 pt-2">
                        <h4 className="text-xs font-black text-teal-600 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-3.5 bg-teal-600 rounded-sm" />
                          Hábitos e Estilo de Vida
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Nível de Atividade Física *</label>
                            <select
                              required
                              value={clinicalForm.physical_activity_level}
                              onChange={e => setClinicalForm({...clinicalForm, physical_activity_level: e.target.value})}
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all cursor-pointer"
                            >
                              <option value="" disabled>Selecione...</option>
                              <option value="Sedentário">Sedentário (Nenhuma atividade física)</option>
                              <option value="Levemente Ativo">Levemente Ativo (Exercício leve 1-3 dias/semana)</option>
                              <option value="Moderadamente Ativo">Moderadamente Ativo (Exercício moderado 3-5 dias/semana)</option>
                              <option value="Muito Ativo">Muito Ativo (Exercício intenso 6-7 dias/semana)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Profissão / Rotina de Trabalho *</label>
                            <input
                              type="text"
                              required
                              value={clinicalForm.profession}
                              onChange={e => setClinicalForm({...clinicalForm, profession: e.target.value})}
                              placeholder="Ex: Fica muito tempo sentado, em pé"
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>

                          <div>
                            <label className="block text-base font-bold text-slate-800 mb-1.5">Qualidade do Sono *</label>
                            <input
                              type="text"
                              required
                              value={clinicalForm.sleep_quality}
                              onChange={e => setClinicalForm({...clinicalForm, sleep_quality: e.target.value})}
                              placeholder="Ex: 8h por noite, sono reparador"
                              className="block w-full rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-teal-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Form action buttons */}
                      <div className="pt-4 flex gap-3 justify-end border-t border-slate-100 mt-6 shrink-0">
                        <button
                          type="button"
                          onClick={() => setIsEditingClinical(false)}
                          className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingClinical || isReadOnly}
                          className="px-5 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors shadow disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {savingClinical ? (
                            <>
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Salvando...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" /> Salvar Ficha Clínica
                            </>
                          )}
                        </button>
                      </div>

                    </form>
                  ) : (
                    /* DISPLAY MODE FOR CLINICAL SCHEMA */
                    <div className="space-y-6">
                      
                      {/* Dados Clínicos details */}
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.allergies 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alergias e Intolerâncias</p>
                            {selectedAppointment.patients.allergies ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5 whitespace-pre-line leading-relaxed">
                                {selectedAppointment.patients.allergies}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Nenhuma informada
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.dietary_restrictions 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Restrições Culturais / Opções</p>
                            {selectedAppointment.patients.dietary_restrictions ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5">
                                {selectedAppointment.patients.dietary_restrictions}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Nenhuma informada
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.pathologies 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patologias ou Doenças Crônicas</p>
                            {selectedAppointment.patients.pathologies ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5 whitespace-pre-line leading-relaxed">
                                {selectedAppointment.patients.pathologies}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Nenhuma informada
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.medications 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Medicamentos / Suplementos Atuais</p>
                            {selectedAppointment.patients.medications ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5 whitespace-pre-line leading-relaxed">
                                {selectedAppointment.patients.medications}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Nenhuma informada
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Estilo de vida details */}
                      <div className="space-y-4 pt-2">
                        <h4 className="text-sm font-extrabold text-teal-600 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-3.5 bg-teal-600/70 rounded-sm" />
                          Hábitos e Estilo de Vida
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.physical_activity_level 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Atividade Física</p>
                            {selectedAppointment.patients.physical_activity_level ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5">
                                {selectedAppointment.patients.physical_activity_level}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Não informado
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.profession 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Profissão / Trabalho</p>
                            {selectedAppointment.patients.profession ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5 truncate" title={selectedAppointment.patients.profession}>
                                {selectedAppointment.patients.profession}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Não informado
                                </span>
                              </div>
                            )}
                          </div>

                          <div className={`p-4 rounded-xl transition-all duration-300 ${
                            selectedAppointment.patients.sleep_quality 
                              ? 'bg-slate-50 border border-slate-200/50' 
                              : 'bg-amber-50/20 border border-dashed border-amber-200'
                          }`}>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Qualidade do Sono</p>
                            {selectedAppointment.patients.sleep_quality ? (
                              <p className="text-base font-normal text-slate-700 mt-1.5">
                                {selectedAppointment.patients.sleep_quality}
                              </p>
                            ) : (
                              <div className="mt-1.5">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-normal rounded-xl bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Não informado
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                </div>

              </div>
            )}

            {/* 3B. TAB: PATIENT HISTORY */}
            {activeTab === 'history' && (
              <div className="space-y-6 animate-in fade-in duration-200 max-w-5xl mx-auto">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white border border-slate-200 rounded-2xl p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mb-3" />
                    <p className="text-sm font-semibold">Carregando histórico do prontuário...</p>
                  </div>
                ) : pastConsultations.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm text-center flex flex-col items-center justify-center">
                    <History className="h-12 w-12 text-slate-300 mx-auto mb-3 stroke-[1.2]" />
                    <h4 className="text-sm font-bold text-slate-800">Nenhum atendimento clínico registrado para este paciente.</h4>
                    <button
                      onClick={() => setActiveTab('form')}
                      className="mt-4 bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition-colors"
                    >
                      Iniciar Novo Atendimento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pastConsultations.map((consultation, idx) => {
                      const docDate = new Date(consultation.created_at);
                      const formattedDate = format(docDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
                      const ant: AnthropometryJson = consultation.anthropometry_json ?? {};

                      return (
                        <div key={consultation.id} className="relative pl-6 pb-2">
                          {idx < pastConsultations.length - 1 && (
                            <div className="absolute top-8 bottom-0 left-2.5 w-0.5 bg-slate-200" />
                          )}
                          
                          <div className="absolute left-0 top-1.5 h-5.5 w-5.5 rounded-full border-2 border-primary-500 bg-white flex items-center justify-center shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-primary-500" />
                          </div>

                          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4 hover:border-slate-300 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2.5 gap-2">
                              <div>
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                  Atendimento Clínico
                                </h4>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                                  Realizado em: {formattedDate}
                                </p>
                              </div>
                              <span className="text-[10px] font-normal text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-2 py-0.5 w-fit">
                                {pickOne(consultation.appointments?.services)?.name || 'Consulta Geral'}
                              </span>
                            </div>

                            {/* Body metrics */}
                            {(ant.weight || ant.height || ant.body_fat || ant.muscle_mass) && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200/50">
                                {ant.weight && (
                                  <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Peso</p>
                                    <p className="text-xs font-normal text-slate-700">{ant.weight} kg</p>
                                  </div>
                                )}
                                {ant.height && (
                                  <div className="border-l border-slate-200/60 pl-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Altura</p>
                                    <p className="text-xs font-normal text-slate-700">{ant.height} m</p>
                                  </div>
                                )}
                                {ant.body_fat && (
                                  <div className="border-l border-slate-200/60 pl-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">% Gordura</p>
                                    <p className="text-xs font-normal text-slate-700">{ant.body_fat}%</p>
                                  </div>
                                )}
                                {ant.muscle_mass && (
                                  <div className="border-l border-slate-200/60 pl-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">% Músculo</p>
                                    <p className="text-xs font-normal text-slate-700">{ant.muscle_mass}%</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Anamnese details */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                Notas da Consulta
                              </p>
                              <div className="text-xs text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50/30 p-3 rounded-xl border border-slate-100 max-h-60 overflow-y-auto">
                                {consultation.anamnese_notes || 'Nenhuma nota registrada nesta consulta.'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3C. TAB: NEW CONSULTATION FORM */}
            <ConsultationForm
              ref={consultationFormRef}
              active={activeTab === "form"}
              appointment={selectedAppointment}
              clinicId={clinic?.id}
              isReadOnly={isReadOnly}
              onFinalized={handleConsultationFinalized}
            />

            {/* 3D. TAB: PATIENT LAB EXAMS MODULE */}
            {activeTab === 'exams' && (
              <div className="space-y-6 animate-in fade-in duration-200 max-w-7xl mx-auto">
                
                {selectedExam ? (
                  /* SPLIT SCREEN VIEW */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-220px)]">
                    
                    {/* LEFT PANEL: PDF Viewer */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-full overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedExam(null);
                              setSelectedExamSignedUrl(null);
                            }}
                            className="p-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl shadow-sm transition-all"
                            title="Voltar para a Lista"
                          >
                            <ArrowLeft className="w-4 h-4" />
                          </button>
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 truncate max-w-[200px] sm:max-w-[320px]">
                              {selectedExam.file_url.split('/').pop()?.substring(13) || 'Exame de Sangue'}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              Enviado em: {format(new Date(selectedExam.created_at), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        </div>

                        <a
                          href={selectedExamSignedUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-extrabold text-teal-600 bg-teal-50 hover:bg-teal-100 border border-teal-100 px-3 py-1.5 rounded-xl transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Abrir Nova Guia
                        </a>
                      </div>

                      <div className="flex-1 bg-slate-100/50 flex items-center justify-center relative">
                        {selectedExamSignedUrl ? (
                          <iframe
                            src={`${selectedExamSignedUrl}#toolbar=0&navpanes=0`}
                            className="w-full h-full border-0"
                            title="Visualizador de PDF"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-slate-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent mb-3" />
                            <p className="text-xs font-bold">Obtendo link seguro do arquivo...</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT PANEL: AI Clinical Assistant */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-full overflow-hidden">
                      
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-900">Assistente de IA Nutricional</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Análise por Gemini 1.5 Pro</p>
                          </div>
                        </div>

                        {parecerClinico && (
                          <button
                            onClick={handleCopyAnalysisToConsultation}
                            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3 py-1.5 rounded-xl transition-all shadow-sm hover:shadow"
                            title="Injeta e copia a análise no prontuário"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copiar para Consulta
                          </button>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/20">
                        <AiAnalysisPanel
                          analysis={selectedExam?.ai_feedback ?? null}
                          exams={exams}
                          selectedExam={selectedExam}
                          analyzing={analyzingExam}
                          onAnalyze={handleAnalyzeExamWithAI}
                          onSaveNote={handleSaveBiomarkerNote}
                        />
                      </div>
                      
                    </div>

                  </div>
                ) : (
                  /* EXAM UPLOAD AND HISTORY VIEW */
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* LEFT 2 COLUMNS: Drag & Drop Upload Container */}
                    <div className="lg:col-span-2 space-y-6">
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={`bg-white rounded-2xl p-10 border-2 border-dashed flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-all duration-300 min-h-[350px] ${
                          dragActive 
                            ? 'border-primary-500 bg-primary-50/10 ring-4 ring-primary-500/5' 
                            : 'border-slate-200/80 hover:border-teal-500 bg-slate-50/50'
                        }`}
                      >
                        <input
                          type="file"
                          id="file-exam-upload"
                          accept="application/pdf"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadExam(e.target.files[0]);
                            }
                          }}
                          className="hidden"
                          disabled={uploadingExam}
                        />

                        {uploadingExam ? (
                          <div className="space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-teal-600 border-t-transparent mx-auto" />
                            <div>
                              <h4 className="text-sm font-extrabold text-slate-800">Carregando arquivo PDF...</h4>
                              <p className="text-xs text-slate-400 mt-1">Isso levará apenas alguns segundos.</p>
                            </div>
                          </div>
                        ) : (
                          <label 
                            htmlFor="file-exam-upload"
                            className="cursor-pointer space-y-4 flex flex-col items-center w-full h-full justify-center group"
                          >
                            <div className="h-16 w-16 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shadow-sm border border-teal-100 transition-transform group-hover:scale-105 duration-300">
                              <UploadCloud className="w-8 h-8 animate-pulse-subtle" />
                            </div>
                            
                            <div>
                              <h4 className="text-base font-extrabold text-slate-800 group-hover:text-teal-600 transition-colors">
                                Clique para selecionar ou arraste o PDF do Exame
                              </h4>
                              <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed mx-auto">
                                Suporta relatórios laboratoriais de exames de sangue em formato PDF oficial. Tamanho máximo de 10MB.
                              </p>
                            </div>
                            
                            <span className="inline-flex items-center gap-1 rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-slate-600 border border-slate-200/80 shadow-sm transition-all hover:bg-slate-50 hover:shadow">
                              Escolher Arquivo
                            </span>
                          </label>
                        )}
                      </div>
                    </div>

                    {/* RIGHT 1 COLUMN: Historical List of Exams */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-[350px]">
                      <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">Histórico de Exames</h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">Análises de exames anteriores</p>
                        </div>
                        <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 border border-slate-200/60 rounded-xl px-2 py-0.5">
                          {exams.length} {exams.length === 1 ? 'exame' : 'exames'}
                        </span>
                      </div>

                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loadingExams ? (
                          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-400 border-t-transparent mb-2" />
                            <p className="text-[11px] font-bold">Buscando exames no banco...</p>
                          </div>
                        ) : (
                          <ExamHistoryList
                            exams={exams}
                            selectedExamId={undefined /* branch sem exame selecionado */}
                            onSelect={handleSelectExam}
                            onDelete={handleDeleteExam}
                            emptyState={(
                              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                                <ClipboardList className="w-10 h-10 text-slate-200 stroke-[1.2] mb-2" />
                                <p className="text-xs font-extrabold text-slate-600">Nenhum exame enviado</p>
                                <p className="text-[10px] text-slate-400 max-w-[160px] leading-normal mt-1 mx-auto">
                                  Os relatórios de exames em PDF enviados ficarão arquivados aqui.
                                </p>
                              </div>
                            )}
                          />
                        )}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
};
