import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  User, 
  UploadCloud,
  Eye,
  Copy, 
  Sparkles,
  ArrowLeft,
  ClipboardList, 
  ShieldAlert,
  Columns,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Type
} from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { applyBiomarkerNote } from '../utils/biomarkers';
import { usePatients } from '../hooks/queries/usePatients';
import { usePatientExams, useExamCache } from '../hooks/queries/usePatientExams';
import { analyzeExamPdf, blobToBase64, GeminiError } from '../lib/gemini';
import { createExamSignedUrl, uploadExamFile, removeExamFile } from '../lib/storage';
import { AiAnalysisPanel } from '../components/exams/AiAnalysisPanel';
import { ExamHistoryList } from '../components/exams/ExamHistoryList';
import { logger } from '../lib/logger';
import type { ExamBiomarker, ExamRecord, PatientRow } from '../types/clinical';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : '');

export const Exams: React.FC = () => {
  const { clinic, isReadOnly, profile, userRole } = useAuth();
  const { showToast } = useToast();

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  // Search & Navigation States
  const [selectedPatient, setSelectedPatient] = useState<PatientRow | null>(null);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  // Lab Exams States
  const [selectedExam, setSelectedExam] = useState<ExamRecord | null>(null);
  const [uploadingExam, setUploadingExam] = useState(false);
  const [analyzingExam, setAnalyzingExam] = useState(false);
  const [selectedExamSignedUrl, setSelectedExamSignedUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Layout Controls
  const [showPatientsSidebar, setShowPatientsSidebar] = useState(true);
  const [workspaceLayout, setWorkspaceLayout] = useState<'split' | 'pdf-focus' | 'ai-focus'>('split');
  const [pdfZoom, setPdfZoom] = useState(100); // 75, 100, 125, 150
  const [aiTextSize, setAiTextSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [examToDelete, setExamToDelete] = useState<ExamRecord | null>(null);

  // Dados via TanStack Query (Onda 4): lista de pacientes e exames com ai_feedback.
  const { data: patients = [], isLoading: loadingPatients } = usePatients(clinic?.id, { enabled: isAuthorized });
  const { data: exams = [], isLoading: loadingExams } = usePatientExams(selectedPatient?.id);
  const { upsertExam, removeExam, invalidate: invalidateExams } = useExamCache(selectedPatient?.id);

  // ai_feedback já vem em `exams` — parecer/alertas/biomarcadores são DERIVADOS
  // do exame selecionado (PERF-04: sem useEffect que rebusca esse campo).
  const alteracoesCriticas: ExamBiomarker[] | null = selectedExam?.ai_feedback?.alertas ?? null;
  const parecerClinico: string | null = selectedExam?.ai_feedback?.insights ?? null;

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
      upsertExam(updatedExam);
      showToast('Observação clínica salva com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro ao salvar nota do biomarcador:', err);
      showToast('Erro ao salvar observação clínica.', 'error');
    }
  };

  // Ao trocar de paciente, limpa a seleção de exame (a lista vem do cache).
  useEffect(() => {
    setSelectedExam(null);
    setSelectedExamSignedUrl(null);
  }, [selectedPatient?.id]);

  // Mantém `selectedExam` sincronizado com a versão em cache (após note/analyze).
  useEffect(() => {
    if (!selectedExam?.id) return;
    const fresh = exams.find((e) => e.id === selectedExam.id);
    if (fresh && fresh !== selectedExam) setSelectedExam(fresh);
  }, [exams, selectedExam]);

  const selectedExamIdRef = useRef<string | null>(null);

  const handleSelectExam = async (exam: ExamRecord | null) => {
    selectedExamIdRef.current = exam?.id ?? null;
    setSelectedExam(exam);
    setSelectedExamSignedUrl(null);
    if (!exam) return;

    try {
      const signedUrl = await createExamSignedUrl(exam.file_url);
      // Guarda contra corrida: só aplica se este ainda é o exame ativo.
      if (selectedExamIdRef.current === exam.id) {
        setSelectedExamSignedUrl(signedUrl);
      }
    } catch (err) {
      logger.error('Erro ao gerar URL assinada:', err);
      showToast('Não foi possível carregar o arquivo do exame.', 'error');
    }
  };

  const handleUploadExam = async (file: File) => {
    if (!selectedPatient?.id || !profile?.id) {
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
      const patientId = selectedPatient.id;
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
      await invalidateExams();

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

  const handleDeleteExam = (exam: ExamRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    setExamToDelete(exam);
  };

  const handleConfirmDelete = async () => {
    if (!examToDelete) return;
    const exam = examToDelete;
    setExamToDelete(null);

    try {
      await removeExamFile(exam.file_url);

      const { error: dbError } = await supabase
        .from('patient_exams')
        .delete()
        .eq('id', exam.id);

      if (dbError) throw dbError;

      showToast('Exame excluído com sucesso!', 'success');
      
      if (selectedExam?.id === exam.id) {
        selectedExamIdRef.current = null;
        setSelectedExam(null);
        setSelectedExamSignedUrl(null);
      }
      removeExam(exam.id);
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
      setSelectedExam(updatedExam);       // parecer/alertas/biomarcadores são derivados
      upsertExam(updatedExam);            // sincroniza o cache do TanStack Query

      showToast('Exame analisado com inteligência artificial com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro na análise de exames:', err);
      showToast(err instanceof GeminiError ? err.message : 'Erro ao analisar o exame.', 'error');
    } finally {
      setAnalyzingExam(false);
    }
  };

  const handleCopyAnalysisToClipboard = () => {
    if (!selectedExam || !parecerClinico) return;
    const alertas = alteracoesCriticas || [];
    const insights = parecerClinico;

    const formattedAlerts = alertas.map((a) =>
      `- **${a.marcador}:** ${a.valor} (Ref: ${a.referencia}) [Gravidade: ${(a.gravidade ?? '').toUpperCase()}]`
    ).join('\n');

    const fullAnalysisMarkdown = `### 🔬 ANÁLISE DE EXAMES LABORATORIAIS (${format(new Date(selectedExam.exam_date ?? selectedExam.created_at), "dd/MM/yyyy")})
    
**Biomarcadores Alterados:**
${formattedAlerts || '- Nenhum biomarcador alterado detectado.'}

**Interpretação & Conduta Nutricional (Gemini AI):**
${insights}`;

    navigator.clipboard.writeText(fullAnalysisMarkdown.trim());
    showToast('Análise de exames copiada para a área de transferência!', 'success');
  };

  // Drag and drop event handlers
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

  // Filter patients based on search input
  const filteredPatients = useMemo(() => {
    return patients.filter(p => 
      p.name.toLowerCase().includes(patientSearchTerm.toLowerCase())
    );
  }, [patients, patientSearchTerm]);

  // If role is secretary, render restricted access page
  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[500px] p-6 animate-in fade-in duration-300">
        <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm text-center max-w-lg flex flex-col items-center">
          <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Acesso Restrito a Profissionais</h2>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            Desculpe, o módulo de <strong>Análise de Exames Laboratoriais e Biomarcadores</strong> é de uso estritamente restrito a profissionais de saúde autorizados (Nutricionistas/Proprietários).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 flex flex-col h-full font-sans pb-10">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight flex items-center gap-2">
            Central de Exames Laboratoriais
          </h1>
          <p className="text-base font-medium text-slate-500 mt-1">
            Gerencie, visualize e analise exames de sangue e relatórios laboratoriais de todos os seus pacientes com suporte de IA.
          </p>
        </div>
      </div>

      {/* THREE-PANEL WORKSPACE */}
      <div className="flex flex-col lg:flex-row gap-6 items-start animate-in fade-in duration-300 text-left">
        
        {/* Left Column: Patients Sidebar */}
        {showPatientsSidebar && (
          <div className="w-full lg:w-80 shrink-0 bg-card-premium p-5 rounded-2xl border border-slate-300/50 shadow-sm flex flex-col h-[calc(100vh-220px)] overflow-hidden animate-in slide-in-from-left duration-300">
            
            <div className="space-y-3 pb-4 border-b border-slate-100">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600" />
                Selecione o Paciente
              </h3>
              
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar paciente..."
                  value={patientSearchTerm}
                  onChange={e => setPatientSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 pl-12 pr-4 py-2 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 focus:border-indigo-600 rounded-lg text-sm font-semibold text-slate-700 shadow-sm transition-all"
                />
              </div>
            </div>

            {/* Patients List Container */}
            <div className="flex-1 overflow-y-auto pt-3 space-y-1.5 pr-1">
              {loadingPatients ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-450">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-teal-650 border-t-transparent mb-2" />
                  <p className="text-[11px] font-medium">Buscando pacientes...</p>
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="text-center py-12 text-slate-450">
                  <p className="text-xs font-medium">Nenhum paciente encontrado</p>
                </div>
              ) : (
                filteredPatients.map(p => {
                  const isSelected = selectedPatient?.id === p.id;
                  const initials = p.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPatient(p);
                        setSelectedExam(null);
                        setSelectedExamSignedUrl(null);
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all duration-200 ${
                        isSelected
                          ? 'bg-teal-50/50 border-teal-200 shadow-sm'
                          : 'bg-white border-transparent hover:bg-slate-100 hover:border-slate-300/50'
                      }`}
                    >
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-semibold shadow-sm border ${
                        isSelected 
                          ? 'bg-teal-600 text-white border-teal-600' 
                          : 'bg-gradient-to-tr from-slate-50 to-teal-50/20 text-slate-700 border-slate-200/60'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-base font-semibold truncate ${isSelected ? 'text-teal-900' : 'text-slate-900'}`}>
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                          {p.biological_sex === 'F' ? 'Feminino' : 'Masculino'} • {getPatientAge(p.birth_date)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Right Column: Exams Content Area */}
        <div className="flex-1 w-full bg-card-premium rounded-2xl shadow-sm border border-slate-300/50 overflow-hidden flex flex-col h-[calc(100vh-220px)]">
          
          {!selectedPatient ? (
            /* EMPTY STATE: NO PATIENT SELECTED */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/10">
              <ClipboardList className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3" />
              <h3 className="text-lg font-semibold text-slate-900">Nenhum paciente selecionado</h3>
              <p className="text-sm font-normal text-slate-500 mt-2 max-w-sm leading-relaxed">
                Escolha um paciente na barra de pesquisa lateral para visualizar seu histórico de exames de sangue, realizar novos uploads ou acionar análises de biomarcadores estruturadas com IA.
              </p>
            </div>
          ) : selectedExam ? (
            /* REDESIGNED PREMIUM EXAM WORKSPACE */
            <div className="flex flex-col h-full overflow-hidden">
              
              {/* UNIFIED PREMIUM TOOLBAR */}
              <div className="p-4 border-b border-slate-300/50 bg-slate-50/80 backdrop-blur-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 shrink-0">
                
                {/* Left controls: Back button, title, upload date */}
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => {
                      setSelectedExam(null);
                      setSelectedExamSignedUrl(null);
                    }}
                    className="p-2 bg-card-premium hover:bg-slate-100 border border-slate-300/50 text-slate-500 hover:text-slate-800 rounded-lg shadow-sm transition-all"
                    title="Voltar para a Lista"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 truncate max-w-[180px] sm:max-w-[240px]" title={selectedExam.file_url.split('/').pop()?.substring(13)}>
                      {selectedExam.file_url.split('/').pop()?.substring(13) || 'Exame de Sangue'}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                      Envio: {format(new Date(selectedExam.created_at), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>

                {/* Middle controls: Layout Selector & Sidebar Toggle */}
                <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                  
                  {/* Sidebar Toggle */}
                  <button
                    onClick={() => setShowPatientsSidebar(!showPatientsSidebar)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-card-premium hover:bg-slate-100 border border-slate-300/50 text-slate-655 hover:text-slate-800 rounded-lg shadow-sm transition-all text-xs font-medium"
                    title={showPatientsSidebar ? "Ocultar Painel de Pacientes" : "Mostrar Painel de Pacientes"}
                  >
                    {showPatientsSidebar ? (
                      <>
                        <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                        <span>Esconder Lateral</span>
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ver Lateral</span>
                      </>
                    )}
                  </button>

                  {/* Layout Segmented Controller */}
                  <div className="flex items-center bg-slate-200/70 p-1 rounded-xl border border-slate-300/35 shadow-inner">
                    <button
                      onClick={() => setWorkspaceLayout('split')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        workspaceLayout === 'split'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Visualização Lado a Lado"
                    >
                      <Columns className={`w-3.5 h-3.5 ${workspaceLayout === 'split' ? 'text-[#5024fc]' : 'text-slate-500'}`} />
                      <span>Dividido</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceLayout('pdf-focus')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        workspaceLayout === 'pdf-focus'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Focar no PDF do Exame"
                    >
                      <FileText className={`w-3.5 h-3.5 ${workspaceLayout === 'pdf-focus' ? 'text-[#5024fc]' : 'text-slate-500'}`} />
                      <span>Foco PDF</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceLayout('ai-focus')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        workspaceLayout === 'ai-focus'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Focar na Análise da IA / Laudo Evolutivo"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${workspaceLayout === 'ai-focus' ? 'text-[#5024fc] animate-pulse' : 'text-slate-500'}`} />
                      <span>Laudo Evolutivo</span>
                    </button>
                  </div>

                  {/* Contextual PDF Zoom Controls */}
                  {(workspaceLayout === 'split' || workspaceLayout === 'pdf-focus') && (
                    <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-300/35 shadow-inner animate-in fade-in duration-200">
                      <button
                        onClick={() => setPdfZoom(prev => Math.max(75, prev - 25))}
                        disabled={pdfZoom <= 75}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all shadow-sm flex items-center justify-center w-6 h-6"
                        title="Reduzir Zoom do PDF"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-medium text-slate-700 px-1 w-10 text-center select-none">
                        {pdfZoom}%
                      </span>
                      <button
                        onClick={() => setPdfZoom(prev => Math.min(150, prev + 25))}
                        disabled={pdfZoom >= 150}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all shadow-sm flex items-center justify-center w-6 h-6"
                        title="Aumentar Zoom do PDF"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Contextual AI Font Size Controls */}
                  {(workspaceLayout === 'split' || workspaceLayout === 'ai-focus') && (
                    <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl border border-slate-300/35 shadow-inner animate-in fade-in duration-200">
                      <div className="p-1 text-slate-500 flex items-center justify-center w-6 h-6">
                        <Type className="w-3.5 h-3.5" />
                      </div>
                      <button
                        onClick={() => {
                          if (aiTextSize === 'xl') setAiTextSize('lg');
                          else if (aiTextSize === 'lg') setAiTextSize('base');
                          else if (aiTextSize === 'base') setAiTextSize('sm');
                        }}
                        disabled={aiTextSize === 'sm'}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all text-xs font-medium w-6 h-6 flex items-center justify-center shadow-sm"
                        title="Diminuir Texto da IA"
                      >
                        -
                      </button>
                      <span className="text-[10px] font-medium text-slate-700 px-0.5 w-6 text-center select-none uppercase">
                        {aiTextSize === 'sm' ? 'P' : aiTextSize === 'base' ? 'M' : aiTextSize === 'lg' ? 'G' : 'GG'}
                      </span>
                      <button
                        onClick={() => {
                          if (aiTextSize === 'sm') setAiTextSize('base');
                          else if (aiTextSize === 'base') setAiTextSize('lg');
                          else if (aiTextSize === 'lg') setAiTextSize('xl');
                        }}
                        disabled={aiTextSize === 'xl'}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all text-xs font-medium w-6 h-6 flex items-center justify-center shadow-sm"
                        title="Aumentar Texto da IA"
                      >
                        +
                      </button>
                    </div>
                  )}

                </div>

                {/* Right controls: Nova Guia & Copiar Análise */}
                <div className="flex items-center gap-2 shrink-0 ml-auto xl:ml-0">
                  <a
                    href={selectedExamSignedUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 px-3.5 py-2 rounded-xl transition-all"
                    title="Abrir PDF original em uma nova guia"
                  >
                    <Eye className="w-3.5 h-3.5" /> <span>Nova Guia</span>
                  </a>

                  {parecerClinico && (
                    <button
                      onClick={handleCopyAnalysisToClipboard}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50/50 hover:bg-emerald-100/50 border border-emerald-100/30 px-3.5 py-2 rounded-xl transition-all shadow-sm"
                      title="Copia a análise estruturada em markdown"
                    >
                      <Copy className="w-3.5 h-3.5" /> <span>Copiar Análise</span>
                    </button>
                  )}
                </div>

              </div>

              {/* MAIN CONTENT SPLIT GRID */}
              <div className={`flex-1 grid grid-cols-1 min-h-0 bg-slate-50/10 ${
                workspaceLayout === 'split' ? 'lg:grid-cols-2 divide-x divide-slate-300/50' : 'lg:grid-cols-1'
              }`}>
                
                {/* LEFT PANEL: PDF Viewer */}
                {workspaceLayout !== 'ai-focus' && (
                  <div className="bg-card-premium flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
                    <div className="flex-1 bg-slate-100/50 flex items-center justify-center relative min-h-0">
                      {selectedExamSignedUrl ? (
                        <div className="w-full h-full overflow-auto relative bg-slate-50">
                          <iframe
                            src={`${selectedExamSignedUrl}#toolbar=0&navpanes=0`}
                            className="absolute inset-0 border-0 transition-all duration-300 origin-top-left"
                            style={{ 
                              transform: `scale(${pdfZoom / 100})`, 
                              width: `${10000 / pdfZoom}%`, 
                              height: `${10000 / pdfZoom}%` 
                            }}
                            title="Visualizador de PDF"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-6 text-slate-400">
                          <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-650 border-t-transparent mb-3" />
                          <p className="text-xs font-medium">Obtendo link seguro do arquivo...</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RIGHT PANEL: AI Clinical Assistant */}
                {workspaceLayout !== 'pdf-focus' && (
                  <div className="bg-card-premium flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
                    
                    {/* Small header inside the AI container to mark the section */}
                    <div className="p-3 border-b border-slate-300/50 bg-slate-50/30 flex items-center gap-2 shrink-0">
                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                      <div>
                        <h5 className="text-xs font-semibold text-slate-900 leading-none">Assistente de IA Nutricional</h5>
                        <p className="text-[10px] text-indigo-500 font-medium uppercase tracking-wider mt-0.5">Gemini 1.5 Pro</p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/20 min-h-0">
                      <AiAnalysisPanel
                        analysis={selectedExam?.ai_feedback ?? null}
                        exams={exams}
                        selectedExam={selectedExam}
                        analyzing={analyzingExam}
                        onAnalyze={handleAnalyzeExamWithAI}
                        onSaveNote={handleSaveBiomarkerNote}
                        textSize={aiTextSize}
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          ) : (
            /* EXAM UPLOAD AND HISTORY TIMELINE VIEW */
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              
              {/* Patient cadastro overview header card */}
              <div className="p-5 border-b border-slate-300/50 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 bg-teal-500 text-white rounded-2xl flex items-center justify-center font-semibold text-base shadow-sm border border-teal-400">
                    {selectedPatient.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selectedPatient.name}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                      Ficha de Evolução e Monitoramento de Exames Laboratoriais
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-300/50">
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">E-mail</p>
                    <p className="text-base font-semibold text-slate-900 mt-1 truncate">{selectedPatient.email || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">WhatsApp</p>
                    <p className="text-base font-semibold text-slate-900 mt-1">{selectedPatient.phone || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Idade</p>
                    <p className="text-base font-semibold text-slate-900 mt-1">{getPatientAge(selectedPatient.birth_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Objetivo Principal</p>
                    <span className="inline-block text-sm font-medium text-emerald-600 bg-emerald-50/50 border border-emerald-100/50 rounded-xl px-3 py-1 mt-1 truncate max-w-[180px]">
                      {selectedPatient.main_goal || 'Reeducação Alimentar'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable drag & drop + exams history list */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0 bg-slate-50/20">
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  
                  {/* LEFT 2 COLUMNS: Drag & Drop upload PDF */}
                  <div className="lg:col-span-2 space-y-4">
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`bg-white rounded-2xl p-8 border-2 border-dashed flex flex-col items-center justify-center text-center shadow-sm relative overflow-hidden transition-all duration-300 min-h-[300px] ${
                        dragActive 
                          ? 'border-teal-500 bg-teal-50/10 ring-4 ring-teal-500/5' 
                          : 'border-slate-200/80 hover:border-teal-500 bg-slate-50/50'
                      }`}
                    >
                      <input
                        type="file"
                        id="central-file-exam-upload"
                        accept="application/pdf"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleUploadExam(e.target.files[0]);
                          }
                        }}
                        className="hidden"
                      />
                      {uploadingExam ? (
                        <div className="space-y-4">
                          <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-650 border-t-transparent mx-auto" />
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">Carregando arquivo PDF...</h4>
                            <p className="text-xs text-slate-500 mt-1">O arquivo está sendo processado.</p>
                          </div>
                        </div>
                      ) : (
                        <label 
                          htmlFor="central-file-exam-upload"
                          className="cursor-pointer space-y-3 flex flex-col items-center w-full h-full justify-center group"
                        >
                          <div className="h-14 w-14 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center shadow-sm border border-teal-100 transition-transform group-hover:scale-105 duration-300">
                            <UploadCloud className="w-7 h-7" />
                          </div>
                          
                          <div>
                            <h4 className="text-base font-semibold text-slate-900 group-hover:text-teal-600 transition-colors">
                              Selecione ou Arraste o PDF do Exame Laboratorial
                            </h4>
                            <p className="text-sm font-normal text-slate-500 mt-1.5 max-w-[280px] leading-relaxed mx-auto">
                              Insira relatórios de exames de sangue ou análises clínicas em PDF oficial de até 10MB.
                            </p>
                          </div>
                          
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-medium text-slate-600 border border-slate-200/80 shadow-sm transition-all hover:bg-slate-50">
                            Escolher Arquivo
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* RIGHT 1 COLUMN: Historical list */}
                  <div className="bg-card-premium rounded-2xl border border-slate-300/50 shadow-sm flex flex-col h-[300px]">
                    <div className="p-3 border-b border-slate-300/50 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900">Exames Anteriores</h4>
                      </div>
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200/60 rounded px-2 py-0.5">
                        {exams.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                      {loadingExams ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-450 border-t-transparent mb-1" />
                          <p className="text-xs font-medium">Buscando exames...</p>
                        </div>
                      ) : (
                        <ExamHistoryList
                          exams={exams}
                          selectedExamId={undefined /* nesta branch nenhum exame está selecionado */}
                          onSelect={handleSelectExam}
                          onDelete={handleDeleteExam}
                          emptyState={(
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center">
                              <ClipboardList className="w-8 h-8 text-slate-200 stroke-[1.2] mb-1" />
                              <p className="text-sm font-medium text-slate-600">Nenhum exame enviado</p>
                              <p className="text-xs text-slate-450 max-w-[150px] leading-normal mt-0.5 mx-auto">
                                Os relatórios em PDF enviados ficarão arquivados aqui.
                              </p>
                            </div>
                          )}
                        />
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>

      </div>

      {/* CUSTOM CONFIRM DELETE MODAL */}
      {examToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xl max-w-md w-full animate-in zoom-in-95 duration-200 text-center flex flex-col items-center">
            <div className="h-14 w-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
              <ShieldAlert className="w-7 h-7" />
            </div>
            
            <h3 className="text-lg font-semibold text-slate-900">Excluir Exame Laboratorial?</h3>
            
            <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
              Você tem certeza que deseja excluir o exame <span className="font-semibold text-slate-950">"{examToDelete.file_url.split('/').pop()?.substring(13) || 'Exame_Laboratorial.pdf'}"</span> permanentemente? Esta ação removerá o laudo original do storage e todos os biomarcadores analisados por IA de forma irreversível.
            </p>
            
            <div className="grid grid-cols-2 gap-3 mt-6 w-full">
              <button
                onClick={() => setExamToDelete(null)}
                className="px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 font-semibold text-sm rounded-xl transition-all shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-3 bg-rose-600 hover:bg-rose-500 border border-rose-600 text-white font-semibold text-sm rounded-xl transition-all shadow-md"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
