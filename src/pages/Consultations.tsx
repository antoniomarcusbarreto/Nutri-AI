import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  X, 
  Mic, 
  MicOff, 
  Check, 
  RotateCcw, 
  History, 
  Clipboard, 
  ChevronLeft, 
  ChevronRight, 
  ClipboardList, 
  Info,
  Scale,
  Activity,
  ArrowRight,
  Volume2,
  Edit,
  Save,
  ArrowLeft,
  UploadCloud,
  Trash2,
  Eye,
  Copy,
  MessageSquare
} from 'lucide-react';
import { format, isSameDay, isToday, parseISO, addDays, subDays, differenceInYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getCanonicalBiomarkerName } from '../utils/biomarkers';

// Safe types for browser SpeechRecognition API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export const Consultations: React.FC = () => {
  const { clinic, isReadOnly, profile } = useAuth();
  const { showToast } = useToast();

  // Search & Filter state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  
  // Data loading state
  const [appointments, setAppointments] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optimizingAI, setOptimizingAI] = useState(false);

  // Selected Detail State
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'history' | 'form' | 'exams'>('profile');
  const [pastConsultations, setPastConsultations] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Lab Exams State
  const [exams, setExams] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [uploadingExam, setUploadingExam] = useState(false);
  const [analyzingExam, setAnalyzingExam] = useState(false);
  const [selectedExamSignedUrl, setSelectedExamSignedUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Estados locais para controle de cache e isolamento de exames
  const [alteracoesCriticas, setAlteracoesCriticas] = useState<any[] | null>(null);
  const [parecerClinico, setParecerClinico] = useState<string | null>(null);
  const [biomarcadores, setBiomarcadores] = useState<any[] | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Observações e Anotações Clínicas
  const [activeNoteEditIndex, setActiveNoteEditIndex] = useState<number | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');

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
      (b: any) => getCanonicalBiomarkerName(b.marcador).toLowerCase() === getCanonicalBiomarkerName(marcador).toLowerCase()
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
    if (!selectedExam || !biomarcadores) return;
    
    const updatedBiomarkers = [...biomarcadores];
    updatedBiomarkers[idx] = {
      ...updatedBiomarkers[idx],
      nota_clinica: tempNoteText.trim()
    };
    
    const updatedAlerts = alteracoesCriticas ? [...alteracoesCriticas] : [];
    const marcadorName = updatedBiomarkers[idx].marcador;
    
    const alertIdx = updatedAlerts.findIndex((a: any) => a.marcador === marcadorName);
    if (alertIdx !== -1) {
      updatedAlerts[alertIdx] = {
        ...updatedAlerts[alertIdx],
        nota_clinica: tempNoteText.trim()
      };
    }
    
    const updatedFeedback = {
      alertas: updatedAlerts,
      insights: parecerClinico || "",
      todos_biomarcadores: updatedBiomarkers
    };
    
    try {
      const { error: dbError } = await supabase
        .from('patient_exams')
        .update({ ai_feedback: updatedFeedback })
        .eq('id', selectedExam.id);
        
      if (dbError) throw dbError;
      
      setBiomarcadores(updatedBiomarkers);
      setAlteracoesCriticas(updatedAlerts);
      
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

  // Form State for new Consultation
  const [anamneseNotes, setAnamneseNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [muscleMass, setMuscleMass] = useState('');

  // Editing Clinical Data State
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

  // Audio Transcription state
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionSupported, setTranscriptionSupported] = useState(true);
  const [speechVolume, setSpeechVolume] = useState<number>(0);
  const [recordingMode, setRecordingMode] = useState<'append' | 'replace'>('append');
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const javascriptNodeRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Fetch appointments
  const fetchAppointments = async () => {
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
      setAppointments(data || []);
    } catch (err) {
      console.error('Erro ao buscar agendamentos:', err);
      showToast('Falha ao carregar agendamentos do banco de dados.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch services for filtering
  const fetchServices = async () => {
    if (!clinic?.id) return;
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('clinic_id', clinic.id)
        .order('name');
      if (!error && data) {
        setServices(data);
      }
    } catch (err) {
      console.error('Erro ao carregar serviços:', err);
    }
  };

  // Fetch patient history when selectedAppointment changes
  const fetchPatientHistory = async (patientId: string) => {
    if (!clinic?.id || !patientId) return;
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
          appointments (
            date_time,
            services ( name )
          )
        `)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPastConsultations(data || []);
    } catch (err) {
      console.error('Erro ao buscar histórico de consultas:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Lab Exams Functions
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

  const handleSelectExam = async (exam: any) => {
    setSelectedExam(exam);
    setSelectedExamSignedUrl(null);
    setAlteracoesCriticas(null);
    setParecerClinico(null);
    setBiomarcadores(null);
    setLoadingDetails(exam ? true : false);
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
      console.warn('VITE_GEMINI_API_KEY não configurada. Simulando análise de exames...');
      showToast('Chave de API do Gemini não configurada. Executando análise simulada...', 'info');
      
      setTimeout(async () => {
        const mockFeedback = {
          insights: "O paciente apresenta um perfil metabólico excelente com a grande maioria dos marcadores em estado de homeostase. Glicose de jejum, hemoglobina glicada e creatinina estão dentro dos limites recomendados. Recomenda-se continuar com a dieta balanceada e monitoramento de rotina.",
          alertas: [],
          todos_biomarcadores: [
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

          // Atualiza os estados locais
          setAlteracoesCriticas(mockFeedback.alertas || []);
          setParecerClinico(mockFeedback.insights || "");
          setBiomarcadores(mockFeedback.todos_biomarcadores || []);

          const updatedExam = { ...selectedExam, ai_feedback: mockFeedback };
          setSelectedExam(updatedExam);
          setExams(prev => prev.map(e => e.id === selectedExam.id ? updatedExam : e));
          
          showToast('Análise de exames simulada concluída!', 'success');
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
  ],
  "analise_preditiva": "Projeção clínica preditiva sobre a evolução metabólica do paciente com base no tratamento nutricional sugerido (mínimo de 3 linhas de análise preditiva)",
  "focos_sugeridos": ["Exatamente três focos principais e práticos de suporte nutricional funcional recomendados"],
  "tempo_estimado": 12
}`;

      // 3. Request Google AI Studio Gemini API
      const aiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

      // Atualiza os estados locais
      setAlteracoesCriticas(feedbackJSON.alertas || []);
      setParecerClinico(feedbackJSON.insights || "");
      setBiomarcadores(feedbackJSON.todos_biomarcadores || []);

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

  const handleCopyAnalysisToConsultation = () => {
    if (!selectedExam || !parecerClinico) return;
    const alertas = alteracoesCriticas || [];
    const insights = parecerClinico;

    const formattedAlerts = alertas.map((a: any) => 
      `- **${a.marcador}:** ${a.valor} (Ref: ${a.referencia}) [Gravidade: ${a.gravidade.toUpperCase()}]`
    ).join('\n');

    const fullAnalysisMarkdown = `\n\n### 🔬 ANÁLISE DE EXAMES LABORATORIAIS (${format(new Date(selectedExam.exam_date), "dd/MM/yyyy")})
    
**Biomarcadores Alterados:**
${formattedAlerts || '- Nenhum biomarcador alterado detectado.'}

**Interpretação & Conduta Nutricional (Gemini AI):**
${insights}`;

    navigator.clipboard.writeText(fullAnalysisMarkdown.trim());
    setAnamneseNotes(prev => prev ? `${prev}\n\n${fullAnalysisMarkdown.trim()}` : fullAnalysisMarkdown.trim());
    showToast('Análise copiada e injetada com sucesso no prontuário ativo!', 'success');
  };

  useEffect(() => {
    if (clinic?.id) {
      fetchAppointments();
      fetchServices();
    }
  }, [clinic?.id]);

  useEffect(() => {
    if (!selectedExam?.id) {
      setAlteracoesCriticas(null);
      setParecerClinico(null);
      setBiomarcadores(null);
      setLoadingDetails(false);
      return;
    }

    const fetchExamDetails = async () => {
      setLoadingDetails(true);
      try {
        const { data, error } = await supabase
          .from('patient_exams')
          .select('ai_feedback')
          .eq('id', selectedExam.id)
          .single();

        if (error) throw error;

        const feedback = data?.ai_feedback;
        if (feedback) {
          setAlteracoesCriticas(feedback.alertas || []);
          setParecerClinico(feedback.insights || "");
          setBiomarcadores(feedback.todos_biomarcadores || []);
        } else {
          setAlteracoesCriticas(null);
          setParecerClinico(null);
          setBiomarcadores(null);
        }
      } catch (err: any) {
        console.error('Erro ao buscar detalhes dinâmicos do exame:', err);
        showToast('Erro ao carregar detalhes do exame.', 'error');
        setAlteracoesCriticas(null);
        setParecerClinico(null);
        setBiomarcadores(null);
      } finally {
        setLoadingDetails(false);
      }
    };

    fetchExamDetails();
  }, [selectedExam?.id]);

  useEffect(() => {
    if (selectedAppointment?.patients?.id) {
      fetchPatientHistory(selectedAppointment.patients.id);
      setSelectedExam(null);
      setSelectedExamSignedUrl(null);
      fetchPatientExams(selectedAppointment.patients.id);
      
      // Reset Form fields
      setAnamneseNotes('');
      setWeight('');
      setHeight('');
      setBodyFat('');
      setMuscleMass('');
      setActiveTab('profile');
      setIsEditingClinical(false);

      // Populate Clinical Form State from selected patient
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
  }, [selectedAppointment]);

  // Audio recording mic waves simulation and volume monitoring
  const startVolumeAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const microphone = audioContext.createMediaStreamSource(stream);
      microphoneRef.current = microphone;
      
      const javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      javascriptNodeRef.current = javascriptNode;
      
      analyser.smoothingTimeConstant = 0.8;
      
      microphone.connect(analyser);
      analyser.connect(javascriptNode);
      javascriptNode.connect(audioContext.destination);
      
      javascriptNode.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
          values += array[i];
        }
        const average = values / length;
        setSpeechVolume(Math.min(100, Math.round(average * 1.8)));
      };
    } catch (err) {
      console.warn('Não foi possível obter áudio para simulação de ondas:', err);
    }
  };

  const stopVolumeAnalysis = () => {
    if (javascriptNodeRef.current) {
      javascriptNodeRef.current.disconnect();
      javascriptNodeRef.current = null;
    }
    if (microphoneRef.current) {
      microphoneRef.current.disconnect();
      microphoneRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setSpeechVolume(0);
  };

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscriptionSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'pt-BR';

    rec.onstart = () => {
      setIsRecording(true);
      startVolumeAnalysis();
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setAnamneseNotes(prev => {
          if (recordingMode === 'replace') {
            return finalTranscript.trim();
          } else {
            return prev ? `${prev.trim()}\n${finalTranscript.trim()}` : finalTranscript.trim();
          }
        });
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      if (event.error === 'not-allowed') {
        showToast('Acesso ao microfone negado. Habilite nas configurações do navegador.', 'error');
      } else {
        showToast(`Erro na transcrição: ${event.error}`, 'error');
      }
      setIsRecording(false);
      stopVolumeAnalysis();
    };

    rec.onend = () => {
      setIsRecording(false);
      stopVolumeAnalysis();
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      stopVolumeAnalysis();
    };
  }, [recordingMode]);

  // Audio recording control
  const toggleRecording = () => {
    if (!transcriptionSupported) {
      showToast('O seu navegador atual não suporta a API de transcrição por voz.', 'error');
      return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
        recognitionRef.current.abort();
        setTimeout(() => recognitionRef.current.start(), 300);
      }
    }
  };

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

  // Handle finalize and save consultation record
  const handleSaveConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!selectedAppointment || !clinic?.id) return;
    if (!anamneseNotes.trim()) {
      showToast('Por favor, preencha as anotações/anamnese da consulta.', 'error');
      return;
    }

    setSaving(true);
    try {
      const anthropometryData = {
        weight: weight ? parseFloat(weight) : null,
        height: height ? parseFloat(height) : null,
        body_fat: bodyFat ? parseFloat(bodyFat) : null,
        muscle_mass: muscleMass ? parseFloat(muscleMass) : null,
      };

      const { data: existing } = await supabase
        .from('consultations')
        .select('id')
        .eq('appointment_id', selectedAppointment.id)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('consultations')
          .update({
            anamnese_notes: anamneseNotes,
            anthropometry_json: anthropometryData
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('consultations')
          .insert([{
            clinic_id: clinic.id,
            appointment_id: selectedAppointment.id,
            patient_id: selectedAppointment.patient_id,
            anamnese_notes: anamneseNotes,
            anthropometry_json: anthropometryData
          }]);
        
        if (error) throw error;
      }

      const { error: apptError } = await supabase
        .from('appointments')
        .update({ status: 'concluido' })
        .eq('id', selectedAppointment.id);

      if (apptError) throw apptError;

      showToast('Atendimento finalizado e prontuário registrado com sucesso!', 'success');
      
      // Refresh local appointment states
      await fetchAppointments();
      
      // Update selected appointment locally
      setSelectedAppointment((prev: any) => prev ? { ...prev, status: 'concluido' } : null);
      
      // Pull history again
      await fetchPatientHistory(selectedAppointment.patient_id);
      
      // Toggle to history tab
      setActiveTab('history');
    } catch (err: any) {
      console.error('Erro ao finalizar consulta:', err);
      showToast(err.message || 'Erro ao registrar a consulta no banco de dados.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Save the modified Clinical Data
  const handleSaveClinicalData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      showToast('O sistema está em modo de somente leitura.', 'error');
      return;
    }
    if (!selectedAppointment?.patients?.id) return;

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
        .eq('id', selectedAppointment.patients.id);

      if (error) throw error;

      showToast('Ficha Clínica atualizada com sucesso!', 'success');

      setSelectedAppointment((prev: any) => {
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
        if (apt.patients?.id === selectedAppointment.patients.id) {
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
    } catch (err: any) {
      console.error('Erro ao salvar ficha clínica:', err);
      showToast(err.message || 'Erro ao salvar a ficha clínica no banco de dados.', 'error');
    } finally {
      setSavingClinical(false);
    }
  };

  // High premium Clinical AI SOAP and Semantic Diarizer Formatter calling Google AI Studio / Gemini 1.5 Pro API
  const handleOptimizeAI = async () => {
    if (!anamneseNotes.trim()) {
      showToast('Digite ou faça uma gravação de áudio primeiro para formatar.', 'error');
      return;
    }

    setOptimizingAI(true);
    showToast('Processando transcrição e estruturando prontuário com Inteligência Artificial...', 'success');

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    if (!apiKey) {
      // Fallback with visual warning to instruct user on how to add VITE_GEMINI_API_KEY to .env.local
      console.warn('VITE_GEMINI_API_KEY não encontrada nas variáveis de ambiente. Usando diarização simulada de alta fidelidade.');
      
      setTimeout(() => {
        const todayDateStr = format(new Date(), "dd/MM/yyyy");
        const optimizedText = `### 🌟 REGISTRO DE ATENDIMENTO INTEGRADO (S.O.A.P.) — ${todayDateStr}

#### 📋 S (SUBJETIVO) - Relato do Paciente:
- **Queixa Principal:** ${anamneseNotes.split('.')[0] || 'Relatos clínicos gerais informados pelo paciente durante a consulta.'}.
- **Histórico Alimentar:** Paciente reporta hábitos diários, picos de ansiedade à noite e cansaço físico. Busca reestruturação metabólica e controle calórico.
- **Sintomas Reportados:** Digestão normal, episódios de indisposição vespertina e sono irregular.

#### 📊 O (OBJETIVO) - Exame Físico e Dados Antropométricos:
- **Peso:** ${weight ? `${weight} kg` : 'Medição pendente'} | **Altura:** ${height ? `${height} m` : 'Medição pendente'}
- **Composição Corporal:** ${bodyFat ? `% Gordura: ${bodyFat}%` : ''} ${muscleMass ? `| % Massa Muscular: ${muscleMass}%` : ''} (Aferido em bioimpedância).
- **Aspecto Geral:** Paciente hidratado, cooperativo e motivado para o acompanhamento.

#### 🔍 A (AVALIAÇÃO) - Diagnóstico Nutricional:
- **Status Metabólico:** Necessidade de adequação de aporte proteico para suporte muscular e termogênese.
- **Comportamento Alimentar:** Necessidade de focar na consistência das refeições e hidratação.

#### ✏️ P (PLANO) - Conduta e Metas Nutricionais:
1. **Prescrição Dietética:** Dieta hiperproteica com redução moderada de carboidratos simples.
2. **Fracionamento:** Inclusão de lanches estratégicos à tarde para controle de apetite noturno.
3. **Metas Semanais:** Beber 35ml de água por kg diariamente e iniciar treinos resistidos 3x na semana.
4. **Retorno:** Agendado retorno em 30 dias para reavaliação.`;

        setAnamneseNotes(optimizedText);
        showToast('Estruturado em modo simulação! Configure VITE_GEMINI_API_KEY no .env.local para chamadas reais.', 'info');
        setOptimizingAI(false);
      }, 1500);
      return;
    }

    try {
      const systemInstruction = `Você é um Diarizador Semântico e Assistente Clínico de Nutrição de alta precisão. Você receberá um bloco de texto bruto contendo a transcrição de uma consulta on-line de nutrição. Sua tarefa prioritária é separar o diálogo analisando o CONTEXTO SEMÂNTICO de cada frase para identificar o Orador.

Regras de Identificação de Orador:
1. NUTRICIONISTA: É quem faz as perguntas clínicas, dá comandos de orientação, explica conceitos metabólicos, propõe metas, calcula porções e dita condutas estruturadas. (Ex: "Como está seu intestino?", "Vamos reduzir esse carboidrato", "Preciso que você beba mais água").
2. PACIENTE: É quem responde com relatos de sintomas, descreve sua rotina diária, expressa dificuldades, preferências alimentares, histórico familiar e queixas de peso ou energia. (Ex: "Eu sinto muita fome à noite", "Não consigo comer salada no almoço", "Engordei 2 quilos desde a última vez").

Com base nessa separação lógica de oradores, processe a transcrição e devolva o Prontuário estruturado em formato JSON com as seguintes chaves:
- resumo_caso (string): Um resumo curto e clínico do estado atual do paciente.
- queixas_paciente (array de strings): Lista de dobras, sintomas, dores e dificuldades relatadas explicitamente pelo paciente.
- conduta_nutricionista (array de strings): Lista de estratégias, alterações de rotina e orientações prescritas pelo profissional durante a fala.
- metas_pactuadas (array de strings): Objetivos de curto prazo definidos em comum acordo na sessão.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
                    text: `Aqui está a transcrição bruta da consulta para processar:\n\n${anamneseNotes}\n\nPor favor, analise a transcrição com cuidado e retorne o JSON estrito conforme as instruções.`
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

      if (!response.ok) {
        throw new Error(`Erro na API do Gemini! Status: ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) {
        throw new Error('Não foi possível obter a resposta de texto do Gemini.');
      }

      const parsedJSON = JSON.parse(rawText.trim());
      
      const {
        resumo_caso = '',
        queixas_paciente = [],
        conduta_nutricionista = [],
        metas_pactuadas = []
      } = parsedJSON;

      const todayDateStr = format(new Date(), "dd/MM/yyyy");
      
      const formattedMarkdown = `### 🌟 REGISTRO DE ATENDIMENTO INTEGRADO (S.O.A.P.) — ${todayDateStr}

#### 📋 S (SUBJETIVO) - Resumo Clínico do Caso:
${resumo_caso}

#### 🔍 QUEIXAS E DIFICULDADES (PACIENTE):
${queixas_paciente.length > 0 
  ? queixas_paciente.map((q: string) => `- ${q}`).join('\n') 
  : '- Nenhuma queixa registrada explicitamente.'}

#### 📊 O (OBJETIVO) - Dados Antropométricos:
- **Peso:** ${weight ? `${weight} kg` : 'Medição pendente'} | **Altura:** ${height ? `${height} m` : 'Medição pendente'}
- **Composição Corporal:** ${bodyFat ? `% Gordura: ${bodyFat}%` : ''} ${muscleMass ? `| % Massa Muscular: ${muscleMass}%` : ''} (Aferido em bioimpedância).

#### 🔍 A (AVALIAÇÃO) - Condutas e Prescrições (NUTRICIONISTA):
${conduta_nutricionista.length > 0 
  ? conduta_nutricionista.map((c: string) => `- ${c}`).join('\n') 
  : '- Nenhuma conduta prescrita registrada.'}

#### 🎯 P (PLANO) - Metas Pactuadas:
${metas_pactuadas.length > 0 
  ? metas_pactuadas.map((m: string) => `- ${m}`).join('\n') 
  : '- Nenhuma meta acordada registrada.'}`;

      setAnamneseNotes(formattedMarkdown);
      showToast('Transcrição diarizada e estruturada em prontuário com sucesso!', 'success');

    } catch (err: any) {
      console.error('Erro ao estruturar notas com Gemini:', err);
      showToast(`Falha ao conectar com o Gemini: ${err.message || err}`, 'error');
    } finally {
      setOptimizingAI(false);
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

  // Helper: status label
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-100 shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Concluído
          </span>
        );
      case 'confirmado':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 border border-blue-100 shadow-sm">
            <Check className="w-3 h-3 text-blue-500" /> Confirmado
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-100 shadow-sm">
            <X className="w-3 h-3 text-rose-500" /> Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700 border border-amber-100 shadow-sm">
            <AlertCircle className="w-3 h-3 text-amber-500" /> Pendente
          </span>
        );
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
                  <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 pl-10 pr-4 py-2.5 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-xl text-xs font-normal text-slate-700 shadow-sm transition-all"
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
              {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mb-3" />
                  <p className="text-sm font-semibold">Buscando lista de atendimentos...</p>
                </div>
              ) : filteredAppointments.length === 0 ? (
                <div className="text-center py-20 text-slate-400 flex flex-col items-center justify-center p-8 bg-white border border-dashed border-slate-200 rounded-3xl max-w-xl mx-auto shadow-sm my-6">
                  <ClipboardList className="h-16 w-16 text-slate-300 stroke-[1.2] mb-3" />
                  <h3 className="text-base font-extrabold text-slate-800">Sem agendamentos nesta data</h3>
                  <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed text-center">
                    Não há consultas programadas ou correspondentes aos filtros para {format(selectedDate, "dd/MM/yyyy")}. Selecione outra data no calendário ao lado ou adicione um novo agendamento na tela de agenda.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredAppointments.map(apt => {
                    const timeStr = format(new Date(apt.date_time), 'HH:mm');
                    const initials = apt.patients?.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

                    return (
                      <div
                        key={apt.id}
                        onClick={() => setSelectedAppointment(apt)}
                        className="group bg-white border border-slate-200/80 hover:border-primary-400 hover:shadow-md rounded-2xl p-5 shadow-sm transition-all duration-300 cursor-pointer flex flex-col justify-between h-56 relative overflow-hidden"
                      >
                        {/* Left indicator accent color */}
                        <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-2xl transition-colors ${
                          apt.status === 'concluido' ? 'bg-emerald-500 group-hover:bg-emerald-600' : 
                          apt.status === 'confirmado' ? 'bg-blue-500 group-hover:bg-blue-600' : 
                          apt.status === 'cancelado' ? 'bg-rose-500 group-hover:bg-rose-600' : 
                          'bg-amber-500 group-hover:bg-amber-600'
                        }`} />

                        {/* Card Top: Time and Status */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-slate-600 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-xl">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {timeStr}
                          </span>
                          {getStatusBadge(apt.status)}
                        </div>

                        {/* Card Middle: Profile summary */}
                        <div className="flex items-center gap-3.5 my-3">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-tr from-primary-50 to-indigo-50 text-primary-700 border border-primary-100 flex items-center justify-center font-extrabold text-sm shadow-sm">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-black text-slate-800 truncate group-hover:text-primary-600 transition-colors">
                              {apt.patients?.name}
                            </h4>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                              {apt.services?.name || 'Consulta Geral'}
                            </p>
                          </div>
                        </div>

                        {/* Card Bottom: Metas & Quick action info */}
                        <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between mt-auto">
                          <span className="text-[10px] font-bold text-slate-400">
                            Objetivo: <span className="text-slate-600 truncate max-w-[120px] inline-block align-bottom">{apt.patients?.main_goal || 'Não informado'}</span>
                          </span>
                          
                          <span className="text-[11px] font-extrabold text-primary-600 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                            Iniciar <ArrowRight className="w-3.5 h-3.5" />
                          </span>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
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
                {selectedAppointment.patients?.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-slate-900 leading-tight">
                    {selectedAppointment.patients?.name}
                  </h2>
                  {getStatusBadge(selectedAppointment.status)}
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
                    <h4 className="text-sm font-bold text-slate-800">Sem registros clínicos anteriores</h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-sm">
                      Este paciente ainda não possui prontuários registrados nesta clínica. A primeira consulta clínica será o ponto inicial para acompanhamentos.
                    </p>
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
                      const ant = consultation.anthropometry_json || {};

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
                                {consultation.appointments?.services?.name || 'Consulta Geral'}
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
            {activeTab === 'form' && (
              <form onSubmit={handleSaveConsultation} className="space-y-6 animate-in fade-in duration-200 max-w-5xl mx-auto">
                
                {/* Antropometria Section */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Scale className="w-4 h-4 text-primary-600" />
                    <h3 className="text-sm font-extrabold text-slate-800">Antropometria (Composição Corporal)</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5">Peso (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 75.5"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5">Altura (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="ex: 1.78"
                        value={height}
                        onChange={e => setHeight(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5">Gordura Corporal (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="ex: 18.4"
                        value={bodyFat}
                        onChange={e => setBodyFat(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5">Massa Muscular (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        placeholder="ex: 35.2"
                        value={muscleMass}
                        onChange={e => setMuscleMass(e.target.value)}
                        className="block w-full rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-primary-500/20 hover:border-slate-300 px-4 py-3 text-base font-normal text-slate-700 bg-slate-50/30 focus:bg-white focus:outline-none focus:ring-2 shadow-sm transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Audio Recorder Module + Text Editor */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                    <div className="flex items-center gap-2">
                      <Clipboard className="w-4 h-4 text-primary-600" />
                      <h3 className="text-sm font-extrabold text-slate-800">Anotações Gerais & Anamnese</h3>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl">
                      <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-300'}`} />
                      <span className="text-[10px] font-bold text-slate-500">
                        {isRecording ? 'Captura de áudio ativa' : 'Gravador pronto'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-sm flex flex-col sm:flex-row items-center gap-5 justify-between relative overflow-hidden">
                    {isRecording && (
                      <div className="absolute inset-0 bg-red-950/20 opacity-40 animate-pulse z-0 pointer-events-none" />
                    )}
                    
                    <div className="flex items-center gap-4 z-10 text-center sm:text-left flex-col sm:flex-row">
                      <button
                        type="button"
                        onClick={toggleRecording}
                        className={`h-16 w-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                          isRecording 
                            ? 'bg-red-600 hover:bg-red-500 ring-4 ring-red-500/30 ring-offset-4 ring-offset-slate-900 scale-105 animate-pulse' 
                            : 'bg-gradient-to-tr from-primary-600 to-indigo-500 hover:from-primary-500 hover:to-indigo-400'
                        }`}
                        title={isRecording ? 'Pausar gravação' : 'Iniciar gravação'}
                      >
                        {isRecording ? (
                          <MicOff className="h-6 w-6 text-white stroke-[2]" />
                        ) : (
                          <Mic className="h-6 w-6 text-white stroke-[2]" />
                        )}
                      </button>
                      
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
                          <Volume2 className={`w-4 h-4 ${isRecording ? 'text-red-400 animate-bounce' : 'text-slate-400'}`} />
                          {isRecording ? 'Ouvindo o atendimento...' : 'Registrar com Áudio'}
                        </h4>
                        <p className="text-[11px] text-slate-300 mt-1 max-w-sm leading-relaxed">
                          {isRecording 
                            ? 'Fale normalmente. As palavras ditadas são adicionadas instantaneamente abaixo.' 
                            : 'Escreva livremente ou utilize nosso gravador de voz para ditar a anamnese do paciente.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0 w-full sm:w-auto z-10">
                      <div className="flex items-center bg-slate-800/80 px-2 py-1.5 rounded-xl border border-slate-700/60 justify-between gap-3">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pl-1">Inserir:</span>
                        <div className="flex p-0.5 bg-slate-900 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setRecordingMode('append')}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                              recordingMode === 'append' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Anexar
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecordingMode('replace')}
                            className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${
                              recordingMode === 'replace' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Substituir
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleOptimizeAI}
                        disabled={optimizingAI}
                        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-[10px] px-3.5 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow disabled:opacity-60"
                      >
                        {optimizingAI ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-primary-400 border-t-transparent" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-primary-400" />
                            Estruturar Anotações (IA)
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {isRecording && (
                    <div className="bg-slate-900/5 px-4 py-2 border border-slate-100 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-300">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Nível de Voz
                      </span>
                      
                      <div className="flex items-center gap-0.5 h-4 flex-1 max-w-[200px] justify-end">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(barIdx => {
                          const active = speechVolume > (barIdx * 8);
                          return (
                            <span 
                              key={barIdx}
                              className={`w-1 rounded-full transition-all duration-100 ${
                                active 
                                  ? 'bg-red-500 h-full' 
                                  : 'bg-slate-200 h-1.5'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-sm font-extrabold text-slate-600 uppercase tracking-wider mb-1.5">Anotações da Consulta *</label>
                    <textarea
                      rows={12}
                      required
                      value={anamneseNotes}
                      onChange={e => setAnamneseNotes(e.target.value)}
                      placeholder="Digite aqui ou ative a gravação de áudio no painel acima..."
                      className="block w-full rounded-xl border border-slate-300 px-5 py-4 text-base focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 font-normal leading-relaxed shadow-sm bg-slate-50/10 focus:bg-white transition-colors"
                    />
                  </div>
                </div>

                {/* Submit Conduta Section */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm shrink-0">
                  <div className="flex items-start gap-2.5 text-left">
                    <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-400 max-w-sm leading-relaxed">
                      Ao finalizar, as anotações e medições físicas serão inseridas no prontuário definitivo deste paciente e o status deste agendamento passará para <strong>Concluído</strong>.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAnamneseNotes('');
                        setWeight('');
                        setHeight('');
                        setBodyFat('');
                        setMuscleMass('');
                      }}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Limpar Campos
                    </button>
                    <button
                      type="submit"
                      disabled={saving || isReadOnly}
                      className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {saving ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Finalizando...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" /> Finalizar Consulta
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </form>
            )}

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
                        {loadingDetails ? (
                          <div className="flex flex-col items-center justify-center h-full text-slate-400 py-20 animate-in fade-in duration-200">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent mb-3" />
                            <p className="text-xs font-bold">Carregando análise do laudo...</p>
                          </div>
                        ) : !alteracoesCriticas && !parecerClinico && !biomarcadores ? (
                          /* EMPTY STATE / RUN ANALYSIS */
                          <div className="flex flex-col items-center justify-center h-full text-center p-6 max-w-md mx-auto space-y-4">
                            <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-50 to-primary-50 text-indigo-600 flex items-center justify-center shadow border border-indigo-100/50 animate-bounce">
                              <Sparkles className="w-8 h-8" />
                            </div>
                            <div>
                              <h5 className="text-base font-extrabold text-slate-800">Pronto para Análise Clínica</h5>
                              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                                Nossa inteligência artificial lê biomarcadores em PDFs, identifica o que está fora dos valores de referência e constrói insights dietéticos personalizados.
                              </p>
                            </div>

                            <button
                              onClick={handleAnalyzeExamWithAI}
                              disabled={analyzingExam}
                              className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-extrabold text-sm py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-75 scale-100 active:scale-95"
                            >
                              {analyzingExam ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent animate-bounce" />
                                  <span>Analisando PDF com IA...</span>
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
                              <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-3.5 bg-indigo-500 rounded-sm" />
                                Alterações Detectadas ({alteracoesCriticas?.length || 0})
                              </h5>

                              {alteracoesCriticas && alteracoesCriticas.length > 0 ? (
                                <div className="grid grid-cols-1 gap-2.5">
                                  {alteracoesCriticas.map((alerta: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className={`p-3.5 rounded-xl border flex justify-between items-center shadow-sm transition-all hover:translate-x-0.5 duration-200 ${
                                        alerta.gravidade === 'alta'
                                          ? 'bg-rose-50/30 border-rose-100'
                                          : 'bg-amber-50/20 border-amber-100'
                                      }`}
                                    >
                                      <div>
                                        <p className="text-sm font-bold text-slate-800">{alerta.marcador}</p>
                                        <p className="text-[11px] text-slate-500 mt-1 font-semibold">
                                          Referência: <span className="text-slate-600">{alerta.referencia}</span>
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-extrabold text-slate-800">{alerta.valor}</p>
                                        <span className={`inline-block text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-lg border mt-1 ${
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
                                <div className="p-4 bg-emerald-50/30 border border-emerald-100 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                  Todos os biomarcadores analisados parecem estar dentro das referências do laboratório!
                                </div>
                              )}
                            </div>

                            {/* Clinical Insights */}
                            <div className="space-y-3 pt-1">
                              <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-3.5 bg-emerald-500 rounded-sm" />
                                Parecer Clínico Nutricional
                              </h5>
                              <div className="text-sm font-medium text-slate-700 leading-relaxed border-l-4 border-emerald-500 bg-emerald-50/10 px-4 py-3.5 rounded-r-xl shadow-inner whitespace-pre-line">
                                {parecerClinico}
                              </div>
                            </div>
                            {/* Full Biomarkers List */}
                            {biomarcadores && (
                              <div className="space-y-3 pt-2">
                                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <span className="w-1.5 h-3.5 bg-slate-400 rounded-sm" />
                                  Lista Completa de Biomarcadores ({biomarcadores.length})
                                </h5>
                                
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm animate-in fade-in duration-200">
                                  <div className="p-3 bg-slate-50/50 grid grid-cols-12 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <span className="col-span-4 sm:col-span-5">Biomarcador</span>
                                    <span className="col-span-3 sm:col-span-2 text-right">Resultado</span>
                                    <span className="col-span-3 sm:col-span-2 text-center">Evolução</span>
                                    <span className="hidden sm:block sm:col-span-2 pl-4">Referência</span>
                                    <span className="col-span-2 sm:col-span-1 text-center">Ações</span>
                                  </div>
                                  <div className="divide-y divide-slate-100">
                                    {biomarcadores.map((bio: any, idx: number) => {
                                      const isAltered = bio.status === 'alterado';
                                      
                                      // Compare dynamically against historical exams
                                      const prevBio = getPreviousExamBiomarker(selectedExam, bio.marcador);
                                      const evo = prevBio ? getEvolutionIndicator(bio.valor, prevBio.valor) : null;
                                      
                                      const hasNote = !!bio.nota_clinica;
                                      const isEditingNote = activeNoteEditIndex === idx;

                                      return (
                                        <div key={idx} className="flex flex-col hover:bg-slate-50/40 transition-colors">
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
                                                      : 'bg-white border-slate-200 text-slate-400 hover:text-slate-655 hover:bg-slate-50'
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
                        ) : exams.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                            <ClipboardList className="w-10 h-10 text-slate-200 stroke-[1.2] mb-2" />
                            <p className="text-xs font-extrabold text-slate-600">Nenhum exame enviado</p>
                            <p className="text-[10px] text-slate-400 max-w-[160px] leading-normal mt-1 mx-auto">
                              Os relatórios de exames em PDF enviados ficarão arquivados aqui.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {exams.map((exam) => {
                              const fileName = exam.file_url.split('/').pop()?.substring(13) || 'Exame_Laboratorial.pdf';
                              const parsedDate = new Date(exam.created_at);
                              const hasAI = !!exam.ai_feedback;

                              return (
                                <div
                                  key={exam.id}
                                  onClick={() => handleSelectExam(exam)}
                                  className="group flex items-center justify-between p-3.5 bg-slate-50/50 hover:bg-teal-50/30 border border-slate-200/60 hover:border-teal-200 rounded-xl cursor-pointer shadow-sm transition-all duration-200"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black ${
                                      hasAI 
                                        ? 'bg-indigo-50 border border-indigo-100 text-indigo-600' 
                                        : 'bg-slate-100 border border-slate-200 text-slate-500'
                                    }`}>
                                      PDF
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-700 truncate max-w-[150px] group-hover:text-teal-700 transition-colors" title={fileName}>
                                        {fileName}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        <span className="text-[9px] text-slate-400 font-bold">
                                          {format(parsedDate, 'dd/MM/yyyy')}
                                        </span>
                                        {hasAI && (
                                          <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase text-indigo-600 bg-indigo-50/80 px-1 py-0.2 rounded border border-indigo-100">
                                            IA
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    onClick={(e) => handleDeleteExam(exam, e)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100 opacity-0 group-hover:opacity-100"
                                    title="Excluir exame"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
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
