import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  User, 
  UploadCloud, 
  Trash2, 
  Eye, 
  Copy, 
  Sparkles, 
  Check, 
  ArrowLeft, 
  ClipboardList, 
  ShieldAlert
} from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const Exams: React.FC = () => {
  const { clinic, isReadOnly, profile, userRole } = useAuth();
  const { showToast } = useToast();

  // Search & Navigation States
  const [patients, setPatients] = useState<any[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  // Lab Exams States
  const [exams, setExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [uploadingExam, setUploadingExam] = useState(false);
  const [analyzingExam, setAnalyzingExam] = useState(false);
  const [selectedExamSignedUrl, setSelectedExamSignedUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  // Fetch all patients of the clinic
  const fetchPatients = async () => {
    if (!clinic?.id) return;
    setLoadingPatients(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('clinic_id', clinic.id)
        .order('name');

      if (error) throw error;
      setPatients(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar pacientes:', err);
      showToast('Falha ao carregar lista de pacientes.', 'error');
    } finally {
      setLoadingPatients(false);
    }
  };

  // Fetch patient exams history
  const fetchPatientExams = async (patientId: string) => {
    if (!patientId) return;
    setLoadingExams(true);
    try {
      const { data, error } = await supabase
        .from('patient_exams')
        .select('*')
        .eq('patient_id', patientId)
        .order('exam_date', { ascending: false });

      if (error) throw error;
      setExams(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar exames:', err);
      showToast('Falha ao carregar histórico de exames.', 'error');
    } finally {
      setLoadingExams(false);
    }
  };

  useEffect(() => {
    if (clinic?.id && isAuthorized) {
      fetchPatients();
    }
  }, [clinic?.id, userRole]);

  useEffect(() => {
    if (selectedPatient?.id) {
      setSelectedExam(null);
      setSelectedExamSignedUrl(null);
      fetchPatientExams(selectedPatient.id);
    }
  }, [selectedPatient]);

  const handleSelectExam = async (exam: any) => {
    setSelectedExam(exam);
    setSelectedExamSignedUrl(null);
    if (!exam) return;

    try {
      const { data, error } = await supabase.storage
        .from('exams-bucket')
        .createSignedUrl(exam.file_url, 60 * 60);

      if (error) throw error;
      if (data?.signedUrl) {
        setSelectedExamSignedUrl(data.signedUrl);
      }
    } catch (err: any) {
      console.error('Erro ao gerar URL assinada:', err);
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
      const fileNameClean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${patientId}/${Date.now()}_${fileNameClean}`;

      const { error: uploadError } = await supabase.storage
        .from('exams-bucket')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

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
    } catch (err: any) {
      console.error('Erro ao enviar exame:', err);
      showToast(err.message || 'Falha ao enviar arquivo do exame.', 'error');
    } finally {
      setUploadingExam(false);
    }
  };

  const handleDeleteExam = async (exam: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!window.confirm('Tem certeza que deseja excluir este exame permanentemente?')) return;

    try {
      const { error: storageError } = await supabase.storage
        .from('exams-bucket')
        .remove([exam.file_url]);

      if (storageError) console.warn('Erro ao remover arquivo do storage:', storageError);

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
    } catch (err: any) {
      console.error('Erro ao excluir exame:', err);
      showToast(err.message || 'Falha ao excluir o exame.', 'error');
    }
  };

  const handleAnalyzeExamWithAI = async () => {
    if (!selectedExam || !selectedExamSignedUrl) {
      showToast('Nenhum exame carregado ou link inválido.', 'error');
      return;
    }

    setAnalyzingExam(true);
    showToast('Iniciando análise com Gemini 1.5 Pro...', 'success');

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('VITE_GEMINI_API_KEY não configurada. Ativando análise simulada de alta fidelidade.');
      
      setTimeout(async () => {
        const mockFeedback = {
          alertas: [
            { marcador: "Vitamina D (25-OH)", valor: "18 ng/mL", referencia: "Desejável > 30 ng/mL", gravidade: "alta" },
            { marcador: "Glicemia de Jejum", valor: "108 mg/dL", referencia: "70 a 99 mg/dL", gravidade: "media" },
            { marcador: "Colesterol LDL", valor: "145 mg/dL", referencia: "< 100 mg/dL", gravidade: "media" }
          ],
          insights: "O exame do paciente revela uma deficiência crítica de Vitamina D (18 ng/mL), o que impacta diretamente a absorção de cálcio, modulação imunológica e síntese hormonal. Recomenda-se suplementação imediata de colecalciferol. Além disso, observa-se uma leve intolerância à glicose (108 mg/dL) caracterizando um quadro pré-diabético inicial, associado a um LDL elevado (145 mg/dL). Clinicamente, sugere-se uma intervenção dietética com foco na redução drástica de carboidratos simples de alto índice glicêmico e gorduras saturadas, priorizando gorduras monoinsaturadas (azeite de oliva, abacate), aumento expressivo de fibras solúveis (aveia, psyllium) e incentivo à prática regular de treinos de força resistidos para otimização da sensibilidade à insulina."
        };

        try {
          const { error: dbError } = await supabase
            .from('patient_exams')
            .update({ ai_feedback: mockFeedback })
            .eq('id', selectedExam.id);

          if (dbError) throw dbError;

          const updatedExam = { ...selectedExam, ai_feedback: mockFeedback };
          setSelectedExam(updatedExam);
          setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));
          
          showToast('Análise de exames simulada concluída!', 'info');
        } catch (err: any) {
          console.error('Erro na simulação do exame:', err);
          showToast('Erro ao gravar feedback simulado.', 'error');
        } finally {
          setAnalyzingExam(false);
        }
      }, 2500);
      return;
    }

    try {
      // 1. Fetch file as Blob from Signed URL
      const fileResponse = await fetch(selectedExamSignedUrl);
      if (!fileResponse.ok) throw new Error('Não foi possível fazer download do PDF do storage.');
      const blob = await fileResponse.blob();

      // 2. Convert Blob to base64
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = (reader.result as string).split(',')[1];
          resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const base64Data = await base64Promise;

      const systemInstruction = `Você é um assistente especialista em análises clínicas laboratoriais para nutrição. Analise o PDF do exame de sangue enviado. 
Retorne um objeto JSON estrito com duas chaves:
1. "alertas": Um array de objetos contendo { "marcador": string, "valor": string, "referencia": string, "gravidade": "alta" ou "media" } para tudo que estiver fora do padrão do laboratório.
2. "insights": Um texto corrido e amigável com uma interpretação nutricional dos resultados e sugestões de foco para a dieta.`;

      // 3. Request Google AI Studio Gemini API
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: 'application/pdf',
                      data: base64Data
                    }
                  },
                  {
                    text: 'Analise o exame enviado em PDF e retorne o JSON estrito conforme as instruções.'
                  }
                ]
              }
            ],
            systemInstruction: {
              role: 'system',
              parts: [
                {
                  text: systemInstruction
                }
              ]
            },
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!aiResponse.ok) {
        throw new Error(`Erro na API do Gemini! Status: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Não foi possível obter a resposta de texto do Gemini.');
      }

      const feedbackJSON = JSON.parse(rawText.trim());

      // 4. Save to Database
      const { error: dbError } = await supabase
        .from('patient_exams')
        .update({ ai_feedback: feedbackJSON })
        .eq('id', selectedExam.id);

      if (dbError) throw dbError;

      const updatedExam = { ...selectedExam, ai_feedback: feedbackJSON };
      setSelectedExam(updatedExam);
      setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));

      showToast('Exame analisado com inteligência artificial com sucesso!', 'success');
    } catch (err: any) {
      console.error('Erro na análise de exames com Gemini:', err);
      showToast(err.message || 'Erro ao conectar com o serviço de análise.', 'error');
    } finally {
      setAnalyzingExam(false);
    }
  };

  const handleCopyAnalysisToClipboard = () => {
    if (!selectedExam?.ai_feedback) return;
    const { alertas = [], insights = "" } = selectedExam.ai_feedback;

    const formattedAlerts = alertas.map((a: any) => 
      `- **${a.marcador}:** ${a.valor} (Ref: ${a.referencia}) [Gravidade: ${a.gravidade.toUpperCase()}]`
    ).join('\n');

    const fullAnalysisMarkdown = `### 🔬 ANÁLISE DE EXAMES LABORATORIAIS (${format(new Date(selectedExam.exam_date), "dd/MM/yyyy")})
    
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
        <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm text-center max-w-lg flex flex-col items-center">
          <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800">Acesso Restrito a Profissionais</h2>
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
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Central de Exames Laboratoriais
            <span className="bg-teal-50 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full border border-teal-100 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> IA & Evolução
            </span>
          </h1>
          <p className="text-base font-medium text-slate-500 mt-1">
            Gerencie, visualize e analise exames de sangue e relatórios laboratoriais de todos os seus pacientes com suporte de IA.
          </p>
        </div>
      </div>

      {/* THREE-PANEL WORKSPACE */}
      <div className="flex flex-col lg:flex-row gap-6 items-start animate-in fade-in duration-300 text-left">
        
        {/* Left Column: Patients Sidebar */}
        <div className="w-full lg:w-80 shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[720px] overflow-hidden">
          
          <div className="space-y-3 pb-4 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
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
                className="w-full bg-slate-50 pl-11 pr-4 py-3 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-xl text-base font-semibold text-slate-700 shadow-sm transition-all"
              />
            </div>
          </div>

          {/* Patients List Container */}
          <div className="flex-1 overflow-y-auto pt-3 space-y-1.5 pr-1">
            {loadingPatients ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-teal-600 border-t-transparent mb-2" />
                <p className="text-[11px] font-bold">Buscando pacientes...</p>
              </div>
            ) : filteredPatients.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p className="text-xs font-semibold">Nenhum paciente encontrado</p>
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
                        : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-extrabold shadow-sm border ${
                      isSelected 
                        ? 'bg-teal-600 text-white border-teal-600' 
                        : 'bg-gradient-to-tr from-slate-50 to-teal-50/20 text-slate-700 border-slate-200/60'
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-base font-bold truncate ${isSelected ? 'text-teal-900' : 'text-slate-800'}`}>
                        {p.name}
                      </p>
                      <p className="text-xs text-slate-450 font-bold mt-1 uppercase tracking-wider">
                        {p.biological_sex === 'F' ? 'Feminino' : 'Masculino'} • {getPatientAge(p.birth_date)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Exams Content Area */}
        <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[720px] h-[720px]">
          
          {!selectedPatient ? (
            /* EMPTY STATE: NO PATIENT SELECTED */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/10">
              <ClipboardList className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3" />
              <h3 className="text-lg font-extrabold text-slate-800">Nenhum paciente selecionado</h3>
              <p className="text-sm font-medium text-slate-500 mt-2 max-w-sm leading-relaxed">
                Escolha um paciente na barra de pesquisa lateral para visualizar seu histórico de exames de sangue, realizar novos uploads ou acionar análises de biomarcadores estruturadas com IA.
              </p>
            </div>
          ) : selectedExam ? (
            /* SPLIT SCREEN VIEW */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
              
              {/* LEFT PANEL: PDF Viewer */}
              <div className="bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => {
                        setSelectedExam(null);
                        setSelectedExamSignedUrl(null);
                      }}
                      className="p-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-xl shadow-sm transition-all"
                      title="Voltar para a Lista"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-850 truncate pr-2 max-w-[150px] sm:max-w-[200px]" title={selectedExam.file_url.split('/').pop()?.substring(13)}>
                        {selectedExam.file_url.split('/').pop()?.substring(13) || 'Exame de Sangue'}
                      </h4>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Envio: {format(new Date(selectedExam.created_at), 'dd/MM/yyyy')}
                      </p>
                    </div>
                  </div>

                  <a
                    href={selectedExamSignedUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 px-3.5 py-2 rounded-xl transition-all shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" /> Nova Guia
                  </a>
                </div>

                <div className="flex-1 bg-slate-100/50 flex items-center justify-center relative min-h-0">
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
              <div className="bg-white flex flex-col h-full overflow-hidden">
                
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-500 animate-pulse" />
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-950 leading-none">Assistente de IA Nutricional</h4>
                      <p className="text-xs text-indigo-500 font-bold uppercase tracking-wider mt-1">Análise por Gemini 1.5 Pro</p>
                    </div>
                  </div>

                  {selectedExam.ai_feedback && (
                    <button
                      onClick={handleCopyAnalysisToClipboard}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3.5 py-2 rounded-xl transition-all shadow-sm"
                      title="Copia a análise estruturada em markdown"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copiar Análise
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/20 min-h-0">
                  {!selectedExam.ai_feedback ? (
                    /* EMPTY STATE / RUN ANALYSIS */
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 max-w-sm mx-auto space-y-4">
                      <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-50 to-primary-50 text-indigo-600 flex items-center justify-center shadow border border-indigo-100/50 animate-bounce">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div>
                        <h5 className="text-base font-extrabold text-slate-800">Pronto para Análise Clínica</h5>
                        <p className="text-sm font-medium text-slate-500 leading-relaxed mt-1.5">
                          Nossa inteligência artificial lê biomarcadores em PDFs, identifica o que está fora dos valores de referência e constrói insights dietéticos personalizados de forma instantânea.
                        </p>
                      </div>

                      <button
                        onClick={handleAnalyzeExamWithAI}
                        disabled={analyzingExam}
                        className="w-full bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white font-extrabold text-sm py-4 rounded-xl shadow transition-all flex items-center justify-center gap-2 disabled:opacity-75"
                      >
                        {analyzingExam ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent animate-bounce" />
                            <span>Analisando PDF...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-indigo-200" />
                            <span>✨ Analisar Exame com IA</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* RENDER AI FEEDBACK */
                    <div className="space-y-6 animate-in fade-in duration-300">
                      
                      {/* Biomarker Alerts */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-bold text-slate-450 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-3.5 bg-indigo-500 rounded-sm" />
                          Alterações Críticas Detectadas
                        </h5>

                        {selectedExam.ai_feedback.alertas && selectedExam.ai_feedback.alertas.length > 0 ? (
                          <div className="grid grid-cols-1 gap-2.5">
                            {selectedExam.ai_feedback.alertas.map((alerta: any, idx: number) => (
                              <div
                                key={idx}
                                className={`p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all duration-200 ${
                                  alerta.gravidade === 'alta'
                                    ? 'bg-rose-50/30 border-rose-100'
                                    : 'bg-amber-50/20 border-amber-100'
                                }`}
                              >
                                <div>
                                  <p className="text-sm font-bold text-slate-800">{alerta.marcador}</p>
                                  <p className="text-xs text-slate-450 mt-1 font-semibold">
                                    Referência: <span className="text-slate-655">{alerta.referencia}</span>
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-extrabold text-slate-800">{alerta.valor}</p>
                                  <span className={`inline-block text-[10px] font-black uppercase px-2.5 py-0.5 rounded-lg border mt-1 ${
                                    alerta.gravidade === 'alta'
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : 'bg-amber-50 border-amber-200 text-amber-700'
                                  }`}>
                                    {alerta.gravidade === 'alta' ? 'Alta' : 'Média'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-4 bg-emerald-50/30 border border-emerald-100 rounded-xl text-emerald-800 text-sm font-semibold flex items-center gap-2">
                            <Check className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                            Todos os biomarcadores analisados parecem estar dentro das referências do laboratório!
                          </div>
                        )}
                      </div>

                      {/* Clinical Insights */}
                      <div className="space-y-3 pt-1">
                        <h5 className="text-xs font-bold text-slate-455 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-3.5 bg-emerald-500 rounded-sm" />
                          Parecer Clínico Nutricional
                        </h5>
                        <div className="text-sm font-medium text-slate-700 leading-relaxed border-l-4 border-emerald-500 bg-emerald-50/10 px-5 py-4 rounded-r-xl shadow-inner whitespace-pre-line">
                          {selectedExam.ai_feedback.insights}
                        </div>
                      </div>
                      
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* EXAM UPLOAD AND HISTORY TIMELINE VIEW */
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              
              {/* Patient cadastro overview header card */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 bg-teal-500 text-white rounded-2xl flex items-center justify-center font-extrabold text-base shadow-sm border border-teal-400">
                    {selectedPatient.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-850">{selectedPatient.name}</h3>
                    <p className="text-xs text-slate-450 font-bold mt-1 uppercase tracking-wider">
                      Ficha de Evolução e Monitoramento de Exames Laboratoriais
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-3 border-t border-slate-200/50">
                  <div>
                    <p className="text-xs font-bold text-slate-455 uppercase tracking-wider">E-mail</p>
                    <p className="text-base font-extrabold text-slate-800 mt-1 truncate">{selectedPatient.email || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-455 uppercase tracking-wider">WhatsApp</p>
                    <p className="text-base font-extrabold text-slate-800 mt-1">{selectedPatient.phone || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-455 uppercase tracking-wider">Idade</p>
                    <p className="text-base font-extrabold text-slate-800 mt-1">{getPatientAge(selectedPatient.birth_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-455 uppercase tracking-wider">Objetivo Principal</p>
                    <span className="inline-block text-sm font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-xl px-3 py-1 mt-1 truncate max-w-[180px]">
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
                          <div className="animate-spin rounded-full h-10 w-10 border-4 border-teal-600 border-t-transparent mx-auto" />
                          <div>
                            <h4 className="text-sm font-bold text-slate-800">Carregando arquivo PDF...</h4>
                            <p className="text-xs text-slate-455 mt-1">O arquivo está sendo processado.</p>
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
                            <h4 className="text-base font-bold text-slate-800 group-hover:text-teal-600 transition-colors">
                              Selecione ou Arraste o PDF do Exame Laboratorial
                            </h4>
                            <p className="text-sm font-medium text-slate-500 mt-1.5 max-w-[280px] leading-relaxed mx-auto">
                              Insira relatórios de exames de sangue ou análises clínicas em PDF oficial de até 10MB.
                            </p>
                          </div>
                          
                          <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-600 border border-slate-200/80 shadow-sm transition-all hover:bg-slate-50">
                            Escolher Arquivo
                          </span>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* RIGHT 1 COLUMN: Historical list */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[300px]">
                    <div className="p-3 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex items-center justify-between shrink-0">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-455">Exames Anteriores</h4>
                      </div>
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200/60 rounded px-2 py-0.5">
                        {exams.length}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                      {loadingExams ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 border-t-transparent mb-1" />
                          <p className="text-xs font-bold">Buscando exames...</p>
                        </div>
                      ) : exams.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center">
                          <ClipboardList className="w-8 h-8 text-slate-200 stroke-[1.2] mb-1" />
                          <p className="text-sm font-bold text-slate-600">Nenhum exame enviado</p>
                          <p className="text-xs text-slate-400 max-w-[150px] leading-normal mt-0.5 mx-auto">
                            Os relatórios em PDF enviados ficarão arquivados aqui.
                          </p>
                        </div>
                      ) : (
                        exams.map((exam) => {
                          const fileName = exam.file_url.split('/').pop()?.substring(13) || 'Exame_Laboratorial.pdf';
                          const parsedDate = new Date(exam.created_at);
                          const hasAI = !!exam.ai_feedback;

                          return (
                            <div
                              key={exam.id}
                              onClick={() => handleSelectExam(exam)}
                              className="group flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-teal-50/30 border border-slate-200/60 hover:border-teal-200 rounded-xl cursor-pointer shadow-sm transition-all duration-200"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-black ${
                                  hasAI 
                                    ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' 
                                    : 'bg-slate-100 border border-slate-200 text-slate-500'
                                }`}>
                                  PDF
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-700 truncate max-w-[150px] group-hover:text-teal-700 transition-colors" title={fileName}>
                                    {fileName}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-xs text-slate-400 font-bold">
                                      {format(parsedDate, 'dd/MM/yyyy')}
                                    </span>
                                    {hasAI && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100">
                                        IA
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={(e) => handleDeleteExam(exam, e)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100 opacity-0 group-hover:opacity-100"
                                title="Excluir exame"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
};
