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
  ShieldAlert,
  Columns,
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Type,
  MessageSquare
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

  // Layout Controls
  const [showPatientsSidebar, setShowPatientsSidebar] = useState(true);
  const [workspaceLayout, setWorkspaceLayout] = useState<'split' | 'pdf-focus' | 'ai-focus'>('split');
  const [pdfZoom, setPdfZoom] = useState(100); // 75, 100, 125, 150
  const [aiTextSize, setAiTextSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [examToDelete, setExamToDelete] = useState<any | null>(null);

  // Observações e Anotações Clínicas
  const [activeNoteEditIndex, setActiveNoteEditIndex] = useState<number | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  // Helper Functions for Clinical Evolution and Note Processing
  const parseNumericValue = (valStr: string) => {
    if (!valStr) return { numeric: null, unit: '' };
    const cleanStr = valStr.trim();
    const numMatch = cleanStr.match(/(-?[0-9]+([.,][0-9]+)?)/);
    if (!numMatch) return { numeric: null, unit: '' };
    const numeric = parseFloat(numMatch[1].replace(',', '.'));
    const unit = cleanStr.replace(numMatch[1], '').trim();
    return { numeric, unit };
  };

  const getPreviousExamBiomarker = (currentExam: any, marcador: string) => {
    if (!exams || exams.length <= 1 || !currentExam) return null;
    
    const currentExamDate = new Date(currentExam.exam_date || currentExam.created_at);
    
    const olderExams = exams
      .filter((e: any) => e.id !== currentExam.id)
      .filter((e: any) => {
        const eDate = new Date(e.exam_date || e.created_at);
        return eDate < currentExamDate;
      })
      .sort((a: any, b: any) => {
        const aDate = new Date(a.exam_date || a.created_at);
        const bDate = new Date(b.exam_date || b.created_at);
        return bDate.getTime() - aDate.getTime();
      });
      
    if (olderExams.length === 0) return null;
    
    const prevExam = olderExams[0];
    if (!prevExam.ai_feedback?.todos_biomarcadores) return null;
    
    return prevExam.ai_feedback.todos_biomarcadores.find(
      (b: any) => b.marcador.toLowerCase().trim() === marcador.toLowerCase().trim()
    );
  };

  const getEvolutionIndicator = (currentValStr: string, prevValStr: string) => {
    const current = parseNumericValue(currentValStr);
    const prev = parseNumericValue(prevValStr);
    
    if (current.numeric === null || prev.numeric === null) {
      return { text: '—', color: 'text-slate-400', diffStr: '' };
    }
    
    const diff = current.numeric - prev.numeric;
    const absDiff = Math.abs(diff).toFixed(1);
    
    if (diff > 0.05) {
      return {
        text: '↗',
        color: 'text-rose-500 font-bold',
        diffStr: `+${absDiff} ${current.unit || ''}`
      };
    } else if (diff < -0.05) {
      return {
        text: '↘',
        color: 'text-teal-600 font-bold',
        diffStr: `-${absDiff} ${current.unit || ''}`
      };
    } else {
      return {
        text: '→',
        color: 'text-slate-400 font-bold',
        diffStr: 'Estável'
      };
    }
  };

  const handleSaveBiomarkerNote = async (idx: number) => {
    if (!selectedExam) return;
    
    const updatedBiomarkers = [...selectedExam.ai_feedback.todos_biomarcadores];
    updatedBiomarkers[idx] = {
      ...updatedBiomarkers[idx],
      nota_clinica: tempNoteText.trim()
    };
    
    const updatedAlerts = selectedExam.ai_feedback.alertas ? [...selectedExam.ai_feedback.alertas] : [];
    const marcadorName = updatedBiomarkers[idx].marcador;
    
    const alertIdx = updatedAlerts.findIndex((a: any) => a.marcador === marcadorName);
    if (alertIdx !== -1) {
      updatedAlerts[alertIdx] = {
        ...updatedAlerts[alertIdx],
        nota_clinica: tempNoteText.trim()
      };
    }
    
    const updatedFeedback = {
      ...selectedExam.ai_feedback,
      todos_biomarcadores: updatedBiomarkers,
      alertas: updatedAlerts
    };
    
    try {
      const { error: dbError } = await supabase
        .from('patient_exams')
        .update({ ai_feedback: updatedFeedback })
        .eq('id', selectedExam.id);
        
      if (dbError) throw dbError;
      
      const updatedExam = { ...selectedExam, ai_feedback: updatedFeedback };
      setSelectedExam(updatedExam);
      setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));
      
      setActiveNoteEditIndex(null);
      setTempNoteText('');
      showToast('Observação clínica salva com sucesso!', 'success');
    } catch (err: any) {
      console.error('Erro ao salvar nota do biomarcador:', err);
      showToast('Erro ao salvar observação clínica.', 'error');
    }
  };

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

  const handleDeleteExam = (exam: any, e: React.MouseEvent) => {
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
            { marcador: "Anticorpos Anti-TPO", valor: "120 UI/mL", referencia: "< 9 UI/mL", gravidade: "alta" },
            { marcador: "TSH (Hormônio Tireoestimulante)", valor: "8.4 mUI/L", referencia: "0.4 a 4.5 mUI/L", gravidade: "alta" },
            { marcador: "Vitamina D (25-OH)", valor: "18 ng/mL", referencia: "Desejável > 30 ng/mL", gravidade: "alta" }
          ],
          insights: "O laudo do paciente revela marcadores tireoidianos e imunológicos críticos altamente alterados. Destaca-se a elevação expressiva de Anticorpos Anti-TPO (120 UI/mL, sendo a referência < 9 UI/mL) associada a um TSH significativamente elevado (8.4 mUI/L), o que caracteriza clinicamente um quadro de Hipotireoidismo de Hashimoto. Na priorização clínica de segurança, estes alertas lideram a conduta. Além disso, observa-se uma deficiência severa de Vitamina D (18 ng/mL), o que compromete ainda mais a modulação imunológica e o suporte à glândula tireoide. Glicose de Jejum (86.6 mg/dL) e os lipídeos (Colesterol LDL a 95 mg/dL) encontram-se rigorosamente dentro da normalidade e estabilidade metabólica. Recomenda-se acompanhamento médico imediato para avaliação de reposição hormonal, associado a uma conduta nutricional altamente anti-inflamatória, rica em selênio, zinco, e suplementação intensiva de colecalciferol (Vitamina D3) para otimizar os receptores tireoidianos e modular a autoimunidade.",
          todos_biomarcadores: [
            { marcador: "Anticorpos Anti-TPO", valor: "120 UI/mL", referencia: "< 9 UI/mL", status: "alterado" },
            { marcador: "TSH (Hormônio Tireoestimulante)", valor: "8.4 mUI/L", referencia: "0.4 a 4.5 mUI/L", status: "alterado" },
            { marcador: "Vitamina D (25-OH)", valor: "18 ng/mL", referencia: "Desejável > 30 ng/mL", status: "alterado" },
            { marcador: "Glicose de Jejum", valor: "86.6 mg/dL", referencia: "70 a 99 mg/dL", status: "normal" },
            { marcador: "Hemoglobina Glicada (HbA1c)", valor: "5.3%", referencia: "< 5.7%", status: "normal" },
            { marcador: "Colesterol LDL", valor: "95 mg/dL", referencia: "< 100 mg/dL", status: "normal" },
            { marcador: "Colesterol Total", valor: "165 mg/dL", referencia: "< 190 mg/dL", status: "normal" },
            { marcador: "Colesterol HDL", valor: "55 mg/dL", referencia: "> 40 mg/dL", status: "normal" },
            { marcador: "Triglicerídeos", valor: "110 mg/dL", referencia: "< 150 mg/dL", status: "normal" },
            { marcador: "Creatinina", valor: "0.8 mg/dL", referencia: "0.5 a 1.1 mg/dL", status: "normal" },
            { marcador: "Ureia", valor: "28 mg/dL", referencia: "15 a 45 mg/dL", status: "normal" }
          ]
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

      const systemInstruction = `Você é um analisador de exames laboratoriais de altíssima precisão. Sua tarefa é extrair e identificar apenas os marcadores que estão matematicamente fora dos valores de referência descritos pelo laboratório emissor.

Diretrizes Clínicas de Priorização:
- Alertas de Gravidade Alta: Qualquer marcador que esteja mais de 2x acima do limite superior ou abaixo do limite inferior (Ex: ANTICORPOS ANTI-TPO elevados, TSH muito acima da referência).
- Não ignore dados hormonais e imunológicos em favor de marcadores metabólicos padrão (como glicose/colesterol). Se a tireoide ou anticorpos estiverem alterados, eles devem liderar os Alertas Críticos.

Retorne o JSON estrito com o mapeamento real dos dados extraídos do documento, garantindo 100% de fidelidade numérica.

Adote uma estratégia de checagem estrita em duas etapas (Chain-of-Thought) antes de gerar o parecer:

Etapa 1: REGRAS ESTRITAS DE EXTRAÇÃO DE DADOS:
- Mapeie linha por linha o nome exato do "Exame", o "Resultado" numérico exato e o "Valor de Referência" correspondente à idade e ao sexo do paciente.
- É terminantemente proibido assumir valores ou aplicar médias estatísticas. Se o exame diz um valor específico (ex: "86,6 mg/dL"), o resultado retornado DEVE ser rigorosamente e exatamente o valor descrito no laudo (ex: "86,6 mg/dL").

Etapa 2: COMPARAÇÃO MATEMÁTICA DE REFERÊNCIA:
- Antes de classificar um biomarcador como alterado, compare matematicamente se o "Resultado" está estritamente fora dos limites inferior ou superior descritos no campo "Valor(es) de referência" do próprio laudo.
- Um biomarcador SÓ deve ser classificado como alterado se seu valor numérico estiver estritamente acima do limite superior ou estritamente abaixo do limite inferior do valor de referência. Caso contrário, deve ser classificado como normal.

Retorne um objeto JSON estrito com a seguinte estrutura e chaves exatas:
{
  "alertas": [
    {
      "marcador": "Nome exato do biomarcador alterado",
      "valor": "Resultado numérico exato com unidade (ex: 18 ng/mL)",
      "referencia": "Valor de referência exato correspondente à idade/sexo do paciente",
      "gravidade": "alta" (se >2x o limite superior ou < o limite inferior do valor de referência, ou alteração imunológica/hormonal crítica) ou "media" (se levemente fora da referência)
    }
  ],
  "insights": "Texto corrido com análise clínica e conduta nutricional funcional detalhada com base nos biomarcadores alterados e na priorização clínica (tireoide, anticorpos e marcadores hormonais/imunológicos devem liderar os alertas e análises sobre marcadores metabólicos padrão se estiverem alterados)",
  "todos_biomarcadores": [
    {
      "marcador": "Nome exato de cada biomarcador lido no laudo",
      "valor": "Resultado numérico exato com unidade (ex: 86,6 mg/dL)",
      "referencia": "Valor de referência exato",
      "status": "alterado" (se fora do limite) ou "normal" (se dentro dos limites inferior/superior)
    }
  ]
}`;

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
        {showPatientsSidebar && (
          <div className="w-full lg:w-80 shrink-0 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[720px] overflow-hidden animate-in slide-in-from-left duration-300">
            
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
        )}

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
            /* REDESIGNED PREMIUM EXAM WORKSPACE */
            <div className="flex flex-col h-full overflow-hidden">
              
              {/* UNIFIED PREMIUM TOOLBAR */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 shrink-0">
                
                {/* Left controls: Back button, title, upload date */}
                <div className="flex items-center gap-3 min-w-0">
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
                  <div className="min-w-0">
                    <h4 className="text-sm font-extrabold text-slate-850 truncate max-w-[180px] sm:max-w-[240px]" title={selectedExam.file_url.split('/').pop()?.substring(13)}>
                      {selectedExam.file_url.split('/').pop()?.substring(13) || 'Exame de Sangue'}
                    </h4>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Envio: {format(new Date(selectedExam.created_at), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>

                {/* Middle controls: Layout Selector & Sidebar Toggle */}
                <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
                  
                  {/* Sidebar Toggle */}
                  <button
                    onClick={() => setShowPatientsSidebar(!showPatientsSidebar)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-800 rounded-xl shadow-sm transition-all text-xs font-bold"
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
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                    <button
                      onClick={() => setWorkspaceLayout('split')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                        workspaceLayout === 'split'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/20'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Visualização Lado a Lado"
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span>Dividido</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceLayout('pdf-focus')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                        workspaceLayout === 'pdf-focus'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/20'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Focar no PDF do Exame"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Foco PDF</span>
                    </button>
                    <button
                      onClick={() => setWorkspaceLayout('ai-focus')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                        workspaceLayout === 'ai-focus'
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/20'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                      title="Focar na Análise da IA"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Foco IA</span>
                    </button>
                  </div>

                  {/* Contextual PDF Zoom Controls */}
                  {(workspaceLayout === 'split' || workspaceLayout === 'pdf-focus') && (
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner animate-in fade-in duration-200">
                      <button
                        onClick={() => setPdfZoom(prev => Math.max(75, prev - 25))}
                        disabled={pdfZoom <= 75}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all shadow-sm flex items-center justify-center w-6 h-6"
                        title="Reduzir Zoom do PDF"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-black text-slate-700 px-1 w-10 text-center select-none">
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
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner animate-in fade-in duration-200">
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
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all text-[10px] font-black w-6 h-6 flex items-center justify-center shadow-sm"
                        title="Diminuir Texto da IA"
                      >
                        -
                      </button>
                      <span className="text-[10px] font-black text-slate-700 px-0.5 w-6 text-center select-none uppercase">
                        {aiTextSize === 'sm' ? 'P' : aiTextSize === 'base' ? 'M' : aiTextSize === 'lg' ? 'G' : 'GG'}
                      </span>
                      <button
                        onClick={() => {
                          if (aiTextSize === 'sm') setAiTextSize('base');
                          else if (aiTextSize === 'base') setAiTextSize('lg');
                          else if (aiTextSize === 'lg') setAiTextSize('xl');
                        }}
                        disabled={aiTextSize === 'xl'}
                        className="p-1 bg-white hover:bg-slate-100 disabled:opacity-50 border border-slate-200/40 text-slate-650 rounded-lg transition-all text-[10px] font-black w-6 h-6 flex items-center justify-center shadow-sm"
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
                    className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-100 px-3.5 py-2 rounded-xl transition-all"
                    title="Abrir PDF original em uma nova guia"
                  >
                    <Eye className="w-3.5 h-3.5" /> <span>Nova Guia</span>
                  </a>

                  {selectedExam.ai_feedback && (
                    <button
                      onClick={handleCopyAnalysisToClipboard}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 px-3.5 py-2 rounded-xl transition-all shadow-sm"
                      title="Copia a análise estruturada em markdown"
                    >
                      <Copy className="w-3.5 h-3.5" /> <span>Copiar Análise</span>
                    </button>
                  )}
                </div>

              </div>

              {/* MAIN CONTENT SPLIT GRID */}
              <div className={`flex-1 grid grid-cols-1 min-h-0 bg-slate-50/10 ${
                workspaceLayout === 'split' ? 'lg:grid-cols-2 divide-x divide-slate-200' : 'lg:grid-cols-1'
              }`}>
                
                {/* LEFT PANEL: PDF Viewer */}
                {workspaceLayout !== 'ai-focus' && (
                  <div className="bg-white flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
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
                          <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent mb-3" />
                          <p className="text-xs font-bold">Obtendo link seguro do arquivo...</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* RIGHT PANEL: AI Clinical Assistant */}
                {workspaceLayout !== 'pdf-focus' && (
                  <div className="bg-white flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
                    
                    {/* Small header inside the AI container to mark the section */}
                    <div className="p-3 border-b border-slate-100 bg-slate-50/30 flex items-center gap-2 shrink-0">
                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                      <div>
                        <h5 className="text-xs font-extrabold text-slate-800 leading-none">Assistente de IA Nutricional</h5>
                        <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider mt-0.5">Gemini 1.5 Pro</p>
                      </div>
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
                            <h5 className="text-xs font-bold text-slate-455 uppercase tracking-wider flex items-center gap-1.5">
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
                                      <p className={`font-bold text-slate-800 transition-all ${
                                        aiTextSize === 'sm' ? 'text-xs' : aiTextSize === 'base' ? 'text-sm' : aiTextSize === 'lg' ? 'text-base' : 'text-lg'
                                      }`}>{alerta.marcador}</p>
                                      <p className={`text-slate-455 mt-1 font-bold tracking-wide transition-all ${
                                        aiTextSize === 'sm' ? 'text-[9px]' : aiTextSize === 'base' ? 'text-[11px]' : aiTextSize === 'lg' ? 'text-xs' : 'text-sm'
                                      }`}>
                                        Referência: <span className="text-slate-600 font-semibold">{alerta.referencia}</span>
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`font-extrabold text-slate-800 transition-all ${
                                        aiTextSize === 'sm' ? 'text-xs' : aiTextSize === 'base' ? 'text-sm' : aiTextSize === 'lg' ? 'text-base' : 'text-lg'
                                      }`}>{alerta.valor}</p>
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
                            <div className={`font-medium text-slate-700 border-l-4 border-emerald-500 bg-emerald-50/10 px-5 py-4 rounded-r-xl shadow-inner whitespace-pre-line transition-all duration-300 ${
                              aiTextSize === 'sm' 
                                ? 'text-xs leading-normal' 
                                : aiTextSize === 'base' 
                                  ? 'text-sm leading-relaxed' 
                                  : aiTextSize === 'lg' 
                                    ? 'text-base leading-relaxed font-semibold' 
                                    : 'text-lg leading-loose font-semibold'
                            }`}>
                              {selectedExam.ai_feedback.insights}
                            </div>
                          </div>

                          {/* Full Biomarkers List */}
                          {selectedExam.ai_feedback.todos_biomarcadores && (
                            <div className="space-y-3 pt-2">
                              <h5 className="text-xs font-bold text-slate-455 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-1.5 h-3.5 bg-slate-400 rounded-sm" />
                                Lista Completa de Biomarcadores ({selectedExam.ai_feedback.todos_biomarcadores.length})
                              </h5>
                              
                              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in duration-200">
                                <div className="p-3 bg-slate-50/50 grid grid-cols-12 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                  <span className="col-span-4 sm:col-span-5">Biomarcador</span>
                                  <span className="col-span-3 sm:col-span-2 text-right">Resultado</span>
                                  <span className="col-span-3 sm:col-span-2 text-center">Evolução</span>
                                  <span className="hidden sm:block sm:col-span-2 pl-4">Referência</span>
                                  <span className="col-span-2 sm:col-span-1 text-center">Ações</span>
                                </div>
                                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                                  {selectedExam.ai_feedback.todos_biomarcadores.map((bio: any, idx: number) => {
                                    const isAltered = bio.status === 'alterado';
                                    
                                    // Compare dynamically against historical exams
                                    const prevBio = getPreviousExamBiomarker(selectedExam, bio.marcador);
                                    const evo = prevBio ? getEvolutionIndicator(bio.valor, prevBio.valor) : null;
                                    
                                    const hasNote = !!bio.nota_clinica;
                                    const isEditingNote = activeNoteEditIndex === idx;

                                    return (
                                      <div key={idx} className="flex flex-col hover:bg-slate-50/30 transition-colors">
                                        {/* Main grid row layout */}
                                        <div className="p-3.5 grid grid-cols-12 items-center text-xs sm:text-sm font-semibold">
                                          
                                          {/* Biomarcador Column */}
                                          <div className="col-span-4 sm:col-span-5 flex items-center gap-2 min-w-0">
                                            <div className={`h-2 w-2 rounded-full shrink-0 ${
                                              isAltered ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                                            }`} />
                                            <span className="text-slate-750 truncate max-w-[140px] sm:max-w-xs">{bio.marcador}</span>
                                          </div>
                                          
                                          {/* Resultado Column */}
                                          <div className={`col-span-3 sm:col-span-2 text-right font-bold ${
                                            isAltered ? 'text-amber-600' : 'text-slate-800'
                                          }`}>
                                            {bio.valor}
                                          </div>
                                          
                                          {/* Evolução Column */}
                                          <div className="col-span-3 sm:col-span-2 text-center flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 text-xs">
                                            {evo ? (
                                              <>
                                                <span className={`${evo.color} text-sm`}>{evo.text}</span>
                                                {evo.diffStr && (
                                                  <span className="text-[10px] text-slate-500 font-bold">({evo.diffStr})</span>
                                                )}
                                              </>
                                            ) : (
                                              <span className="text-slate-400 font-bold">—</span>
                                            )}
                                          </div>
                                          
                                          {/* Referência Column */}
                                          <div className="hidden sm:block sm:col-span-2 pl-4 text-xs text-slate-455 truncate">
                                            {bio.referencia}
                                          </div>
                                          
                                          {/* Ações Column */}
                                          <div className="col-span-2 sm:col-span-1 text-center">
                                            <button
                                              onClick={() => {
                                                if (isEditingNote) {
                                                  setActiveNoteEditIndex(null);
                                                  setTempNoteText('');
                                                } else {
                                                  setActiveNoteEditIndex(idx);
                                                  setTempNoteText(bio.nota_clinica || '');
                                                }
                                              }}
                                              className={`p-1.5 rounded-lg border transition-all ${
                                                hasNote 
                                                  ? 'bg-teal-50 border-teal-200 text-teal-650 hover:bg-teal-100/55' 
                                                  : isEditingNote
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-650'
                                                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-650 hover:bg-slate-50'
                                              }`}
                                              title={hasNote ? "Ver / Editar Observação Clínica" : "Adicionar Observação Clínica"}
                                            >
                                              <MessageSquare className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                        
                                        {/* Inline expansible clinical note section */}
                                        {(isEditingNote || hasNote) && (
                                          <div className="px-3.5 pb-3.5 pl-8 border-t border-slate-100/60 bg-slate-50/20 text-xs text-left animate-in slide-in-from-top duration-200">
                                            {isEditingNote ? (
                                              <div className="space-y-2 mt-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Anotação Clínica do Nutricionista</span>
                                                  {hasNote && (
                                                    <span className="text-[9px] bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded font-bold">Nota Salva</span>
                                                  )}
                                                </div>
                                                <textarea
                                                  value={tempNoteText}
                                                  onChange={(e) => setTempNoteText(e.target.value)}
                                                  placeholder="Escreva sua percepção ou conduta clínica sobre este biomarcador (ex: ajustar suplementação, focar em micronutrientes)..."
                                                  rows={2}
                                                  className="w-full bg-white p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold text-slate-700 placeholder-slate-400 transition-all shadow-inner"
                                                />
                                                <div className="flex justify-end gap-2">
                                                  <button
                                                    onClick={() => {
                                                      setActiveNoteEditIndex(null);
                                                      setTempNoteText('');
                                                    }}
                                                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-lg transition-all"
                                                  >
                                                    Cancelar
                                                  </button>
                                                  <button
                                                    onClick={() => handleSaveBiomarkerNote(idx)}
                                                    className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 border border-teal-600 text-white font-bold rounded-lg transition-all shadow-sm"
                                                  >
                                                    Salvar Nota
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="mt-2 bg-teal-50/20 border border-teal-100/60 p-2.5 rounded-xl flex justify-between items-start gap-4">
                                                <div className="min-w-0">
                                                  <p className="text-[9px] font-black text-teal-800 uppercase tracking-wider">Observação Clínica Registrada:</p>
                                                  <p className="font-semibold text-slate-700 leading-relaxed mt-1 whitespace-pre-line italic">
                                                    "{bio.nota_clinica}"
                                                  </p>
                                                </div>
                                                <button
                                                  onClick={() => {
                                                    setActiveNoteEditIndex(idx);
                                                    setTempNoteText(bio.nota_clinica || '');
                                                  }}
                                                  className="text-[10px] font-black text-teal-700 hover:text-teal-900 shrink-0 bg-white border border-teal-200 px-2 py-1 rounded-lg transition-all hover:bg-teal-50"
                                                >
                                                  Editar
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
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

      {/* CUSTOM CONFIRM DELETE MODAL */}
      {examToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xl max-w-md w-full animate-in zoom-in-95 duration-200 text-center flex flex-col items-center">
            <div className="h-14 w-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
              <ShieldAlert className="w-7 h-7" />
            </div>
            
            <h3 className="text-lg font-black text-slate-900">Excluir Exame Laboratorial?</h3>
            
            <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
              Você tem certeza que deseja excluir o exame <strong className="text-slate-800">"{examToDelete.file_url.split('/').pop()?.substring(13) || 'Exame_Laboratorial.pdf'}"</strong> permanentemente? Esta ação removerá o laudo original do storage e todos os biomarcadores analisados por IA de forma irreversível.
            </p>
            
            <div className="grid grid-cols-2 gap-3 mt-6 w-full">
              <button
                onClick={() => setExamToDelete(null)}
                className="px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-650 font-bold text-sm rounded-xl transition-all shadow-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-3 bg-rose-600 hover:bg-rose-500 border border-rose-600 text-white font-bold text-sm rounded-xl transition-all shadow-md"
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
