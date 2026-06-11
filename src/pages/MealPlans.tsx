import React, { useState, useEffect, useMemo } from 'react';
import { 
  Apple, 
  Sparkles, 
  Trash2, 
  Plus, 
  Save, 
  RefreshCw, 
  FileText, 
  Brain, 
  Clock, 
  Edit, 
  Printer, 
  Calendar,
  Eye,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

interface MealOption {
  description: string;
  items: string[];
  kcal: number;
}

interface MealPlanData {
  kcal: number;
  meals: {
    [key: string]: MealOption[];
  };
}

const MEAL_NAMES: { [key: string]: string } = {
  breakfast: 'Café da Manhã',
  morning_snack: 'Lanche da Manhã',
  lunch: 'Almoço',
  afternoon_snack: 'Lanche da Tarde',
  pre_workout: 'Pré-Treino',
  post_workout: 'Pós-Treino',
  dinner: 'Jantar',
  supper: 'Ceia'
};
export const MealPlans: React.FC = () => {
  const { clinic, isReadOnly, profile } = useAuth();
  const { showToast } = useToast();

  const getHeaderTheme = () => {
    const themeColor = profile?.theme_color || 'white';

    if (themeColor === 'blue') {
      return {
        bg: 'bg-[#11162a]',
        text: 'text-white',
        icon: 'text-blue-400',
        border: 'border-slate-800',
        switcherBg: 'bg-slate-800/80 border-slate-700/30',
        switcherActive: 'bg-white text-slate-900 shadow-sm',
        switcherInactive: 'text-slate-400 hover:text-white'
      };
    }
    if (themeColor === 'teal') {
      return {
        bg: 'bg-[#115e59]',
        text: 'text-white',
        icon: 'text-teal-200',
        border: 'border-teal-700/30',
        switcherBg: 'bg-teal-800/50 border-teal-700/20',
        switcherActive: 'bg-white text-teal-900 shadow-sm',
        switcherInactive: 'text-teal-200 hover:text-white'
      };
    }
    if (themeColor === 'dark') {
      return {
        bg: 'bg-[#1a1a1a]',
        text: 'text-slate-100',
        icon: 'text-primary-400',
        border: 'border-[#333333]',
        switcherBg: 'bg-[#242424]/80 border-[#333333]/50',
        switcherActive: 'bg-white text-slate-900 shadow-sm',
        switcherInactive: 'text-slate-400 hover:text-slate-100'
      };
    }

    // Default 'white' / Claro
    return {
      bg: 'bg-slate-50',
      text: 'text-slate-800',
      icon: 'text-primary-600',
      border: 'border-slate-200',
      switcherBg: 'bg-slate-100 border border-slate-200/40',
      switcherActive: 'bg-white text-slate-850 shadow-xs',
      switcherInactive: 'text-slate-500 hover:text-slate-800'
    };
  };

  const headerTheme = getHeaderTheme();

  // Navigation / Tab States
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');

  // Core Data States
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  
  // Patient Context Cache
  const [latestConsultation, setLatestConsultation] = useState<any | null>(null);
  const [latestExam, setLatestExam] = useState<any | null>(null);
  const [pastPlans, setPastPlans] = useState<any[]>([]);
  
  // Loading States
  const [loadingContext, setLoadingContext] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI & Plan Parameters
  const [includeConsultation, setIncludeConsultation] = useState(true);
  const [includeExams, setIncludeExams] = useState(true);
  const [kcalTarget, setKcalTarget] = useState<string>('2000');
  const [suggestKcalWithAI, setSuggestKcalWithAI] = useState(false);
  const [selectedMeals, setSelectedMeals] = useState<string[]>([
    'breakfast',
    'lunch',
    'afternoon_snack',
    'dinner'
  ]);

  // Active Plan Editor State
  const [activePlan, setActivePlan] = useState<MealPlanData | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('Plano Alimentar Inteligente');
  const [optionActiveTab, setOptionActiveTab] = useState<{ [key: string]: number }>({});

  // Modal State for Viewing Context
  const [showConsultationModal, setShowConsultationModal] = useState(false);
  const [showExamModal, setShowExamModal] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [examPdfUrl, setExamPdfUrl] = useState<string | null>(null);
  const [loadingPdfUrl, setLoadingPdfUrl] = useState(false);

  // Dynamic signed URL fetcher for latest exam PDF
  useEffect(() => {
    if (!showExamModal || !latestExam?.file_url) {
      setExamPdfUrl(null);
      return;
    }

    const fetchExamPdf = async () => {
      setLoadingPdfUrl(true);
      try {
        const { data, error } = await supabase.storage
          .from('exams-bucket')
          .createSignedUrl(latestExam.file_url, 60 * 60);

        if (error) throw error;
        if (data?.signedUrl) {
          setExamPdfUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Erro ao gerar URL assinada para exame:', err);
        showToast('Não foi possível carregar o PDF do exame.', 'error');
      } finally {
        setLoadingPdfUrl(false);
      }
    };

    fetchExamPdf();
  }, [showExamModal, latestExam]);

  // Load Clinic Patients
  useEffect(() => {
    const loadPatients = async () => {
      if (!clinic?.id) return;
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, name, email, phone, birth_date, biological_sex, main_goal')
          .eq('clinic_id', clinic.id)
          .eq('status', 'ativo')
          .order('name');

        if (error) throw error;
        setPatients(data || []);
        if (data && data.length > 0) {
          const storedId = localStorage.getItem('nutri-ai:selected-patient-id');
          const exists = data.some((p: any) => p.id === storedId);
          const initialId = exists && storedId ? storedId : data[0].id;
          setSelectedPatientId(initialId);
          localStorage.setItem('nutri-ai:selected-patient-id', initialId);
        }
      } catch (err) {
        console.error('Erro ao carregar pacientes:', err);
        showToast('Erro ao carregar lista de pacientes.', 'error');
      }
    };

    loadPatients();
  }, [clinic?.id]);

  // Load Patient Context & Past Plans
  useEffect(() => {
    if (!selectedPatientId || !clinic?.id) {
      setLatestConsultation(null);
      setLatestExam(null);
      setPastPlans([]);
      setActivePlan(null);
      return;
    }
    const loadPatientContext = async () => {
      setLoadingContext(true);
      try {
        // 1. Fetch latest consultation
        const { data: consultationData, error: consultationError } = await supabase
          .from('consultations')
          .select(`
            id,
            anamnese_notes,
            created_at,
            appointments!inner (
              status
            )
          `)
          .eq('patient_id', selectedPatientId)
          .neq('appointments.status', 'cancelado')
          .neq('appointments.status', 'Cancelado')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (consultationError) throw consultationError;
        setLatestConsultation(consultationData);
        setIncludeConsultation(!!consultationData);

        // 2. Fetch latest exam with ai_feedback and file_url
        const { data: examData, error: examError } = await supabase
          .from('patient_exams')
          .select('id, ai_feedback, exam_date, created_at, file_url')
          .eq('patient_id', selectedPatientId)
          .order('exam_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (examError) throw examError;
        setLatestExam(examData);
        setIncludeExams(!!examData);

        // 3. Fetch past meal plans
        const { data: plansData, error: plansError } = await supabase
          .from('meal_plans')
          .select('id, kcal, meals, created_at')
          .eq('patient_id', selectedPatientId)
          .order('created_at', { ascending: false });

        if (plansError) throw plansError;
        setPastPlans(plansData || []);

        // Prepopulate option active tabs to Option 0 for all meals
        const initialTabs: { [key: string]: number } = {};
        Object.keys(MEAL_NAMES).forEach(m => {
          initialTabs[m] = 0;
        });
        setOptionActiveTab(initialTabs);
      } catch (err) {
        console.error('Erro ao buscar histórico do paciente:', err);
        showToast('Erro ao buscar histórico clínico.', 'error');
      } finally {
        setLoadingContext(false);
      }
    };

    loadPatientContext();
  }, [selectedPatientId, clinic?.id]);

  const selectedPatient = useMemo(() => {
    return patients.find(p => p.id === selectedPatientId);
  }, [patients, selectedPatientId]);

  // Toggle Meals selector
  const handleToggleMeal = (mealKey: string) => {
    if (selectedMeals.includes(mealKey)) {
      if (selectedMeals.length > 1) {
        setSelectedMeals(selectedMeals.filter(m => m !== mealKey));
      } else {
        showToast('Selecione pelo menos uma refeição.', 'error');
      }
    } else {
      setSelectedMeals([...selectedMeals, mealKey]);
    }
  };

  // Generate blank plan structure for manual entry
  const handleStartManualPlan = () => {
    if (!selectedPatientId) return;
    
    const blankMeals: { [key: string]: MealOption[] } = {};
    selectedMeals.forEach(meal => {
      blankMeals[meal] = [
        { description: 'Opção 1 - Digite os alimentos aqui', items: ['Alimento 1', 'Alimento 2'], kcal: 0 },
        { description: 'Opção 2 - Alternativa de cardápio', items: [], kcal: 0 },
        { description: 'Opção 3 - Outra alternativa de cardápio', items: [], kcal: 0 }
      ];
    });

    setActivePlan({
      kcal: suggestKcalWithAI ? 2000 : parseInt(kcalTarget) || 2000,
      meals: blankMeals
    });
    setEditingTitle('Plano Alimentar Manual');
    showToast('Estrutura de plano alimentar criada para preenchimento manual.', 'success');
  };

  // Trigger Gemini AI Generation with Context
  const handleGenerateAIPlan = async () => {
    if (!selectedPatientId || !clinic?.id || !profile?.id) return;
    setGenerating(true);
    showToast('A IA está analisando o histórico e estruturando a dieta...', 'info');

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    // Consolidate prompt context
    let contextPrompt = `Paciente: ${selectedPatient?.name || 'Paciente'}, sexo biológico ${selectedPatient?.biological_sex || 'Não definido'}, objetivo principal: ${selectedPatient?.main_goal || 'Equilíbrio nutricional'}.\n`;
    
    if (selectedPatient?.birth_date) {
      const age = new Date().getFullYear() - new Date(selectedPatient.birth_date).getFullYear();
      contextPrompt += `Idade: ${age} anos.\n`;
    }

    if (includeConsultation && latestConsultation?.anamnese_notes) {
      contextPrompt += `\n### HISTÓRICO DE CONSULTA RECENTE (Anamnese):\n${latestConsultation.anamnese_notes}\n`;
    }

    if (includeExams && latestExam?.ai_feedback) {
      const feedback = latestExam.ai_feedback;
      const alerts = feedback.alertas || [];
      const insights = feedback.insights || '';
      contextPrompt += `\n### HISTÓRICO DE EXAME RECENTE:\n`;
      if (alerts.length > 0) {
        contextPrompt += `Biomarcadores alterados:\n`;
        alerts.forEach((a: any) => {
          contextPrompt += `- ${a.marcador}: ${a.valor} (Referência: ${a.referencia}) [Gravidade: ${a.gravidade}]\n`;
        });
      }
      if (insights) {
        contextPrompt += `Análise de exames da IA: ${insights}\n`;
      }
    }

    contextPrompt += `\n### DIRETRIZES DO PLANO ALIMENTAR:\n`;
    if (suggestKcalWithAI) {
      contextPrompt += `- Meta Calórica: A IA deve sugerir o valor de calorias ideal baseado no metabolismo estimado do paciente e histórico clínico acima.\n`;
    } else {
      contextPrompt += `- Meta Calórica Estrita: ${kcalTarget} kcal.\n`;
    }
    contextPrompt += `- Refeições solicitadas (gere exatamente essas chaves no JSON): ${selectedMeals.join(', ')}.\n`;
    contextPrompt += `- Regra estrita de opções: Para cada uma das refeições listadas, crie exatamente 3 opções de cardápios alternativos ricos em nutrientes, com descrição (description), lista de alimentos específicos (items) e calorias estimadas para cada opção (kcal).\n`;

    const systemInstruction = `Você é um assistente de inteligência artificial especialista em nutrição clínica integrativa e medicina funcional.
Analise o histórico e exames fornecidos do paciente.
Crie um plano alimentar estruturado em JSON com a meta de calorias exata e as refeições solicitadas.
Você deve sugerir alimentos práticos, anti-inflamatórios e saudáveis adequados às restrições ou biomarcadores alterados do paciente.
Por exemplo, se o exame mostra Vitamina D baixa ou glicemia alterada, sugira alimentos/hábitos condizentes.
Retorne APENAS um objeto JSON válido, sem markdown, contendo a seguinte estrutura exata:
{
  "kcal": <número total de calorias sugerido pela IA ou correspondente a meta solicitada>,
  "meals": {
    "breakfast": [
      { "description": "Tapioca com ovos caipiras", "items": ["2 ovos", "3 colheres de goma de tapioca", "30g queijo coalho"], "kcal": 420 },
      { "description": "Mingau de aveia com whey e amêndoas", "items": ["30g whey protein", "40g aveia", "15g amêndoas"], "kcal": 380 },
      { "description": "Panqueca de banana funcional", "items": ["1 banana", "1 ovo", "2 colheres de farelo de aveia"], "kcal": 350 }
    ],
    ... para cada uma das refeições solicitadas ...
  }
}`;

    if (!apiKey) {
      console.warn('VITE_GEMINI_API_KEY não configurada. Simulando plano inteligente de alta fidelidade...');
      setTimeout(() => {
        // High fidelity simulation
        const mockPlan: MealPlanData = {
          kcal: suggestKcalWithAI ? 1950 : parseInt(kcalTarget) || 2000,
          meals: {}
        };

        selectedMeals.forEach(meal => {
          if (meal === 'breakfast') {
            mockPlan.meals.breakfast = [
              { description: 'Tapioca funcional com ovos e queijo branco', items: ['2 ovos caipiras mexidos', '3 colheres de sopa de goma de tapioca', '30g de queijo branco fresco', '1 xícara de café sem açúcar'], kcal: 380 },
              { description: 'Omelete de claras com espinafre e aveia', items: ['3 claras e 1 gema de ovo', '1 punhado de espinafre fresco picado', '2 colheres de aveia em flocos', '1 xícara de chá verde'], kcal: 320 },
              { description: 'Shake proteico com banana e pasta de amendoim', items: ['30g de whey protein isolado', '1 banana prata média', '1 colher de sopa de pasta de amendoim integral', '200ml de água mineral'], kcal: 360 }
            ];
          } else if (meal === 'morning_snack') {
            mockPlan.meals.morning_snack = [
              { description: 'Mix de castanhas e sementes com coco', items: ['4 castanhas-do-pará', '5 amêndoas torradas', '10g de lascas de coco seco'], kcal: 180 },
              { description: 'Fruta com semente de chia', items: ['1 fatia de mamão formosa médio', '1 colher de sopa de sementes de chia hidratadas'], kcal: 120 },
              { description: 'Iogurte natural proteico com morangos', items: ['1 pote de iogurte grego natural desnatado', '5 morangos frescos higienizados'], kcal: 140 }
            ];
          } else if (meal === 'lunch') {
            mockPlan.meals.lunch = [
              { description: 'Frango grelhado ao limão com arroz integral e legumes', items: ['120g de filé de peito de frango grelhado', '3 colheres de sopa de arroz integral', '1 concha média de feijão carioca', 'Salada de folhas verdes à vontade com azeite de oliva extra virgem', '80g de brócolis cozido no vapor'], kcal: 580 },
              { description: 'Posta de salmão ao forno com batata doce', items: ['100g de filé de salmão assado', '100g de batata doce assada com alecrim', 'Salada de alface, tomate cereja e pepino', '1 colher de chá de gergelim preto'], kcal: 620 },
              { description: 'Patinho moído com purê de abóbora e aspargos', items: ['120g de carne moída (patinho) refogada com alho e cebola', '120g de purê de abóbora cabotiá', '6 aspargos grelhados com azeite'], kcal: 540 }
            ];
          } else if (meal === 'afternoon_snack') {
            mockPlan.meals.afternoon_snack = [
              { description: 'Torrada integral com homus de grão-de-bico', items: ['2 fatias de pão integral de fermentação natural tostadas', '2 colheres de sopa de homus tahine'], kcal: 220 },
              { description: 'Muffin de banana funcional feito na caneca', items: ['1 ovo', '1 colher de farinha de coco', '1/2 banana prata amassada', '1 colher de chá de cacau em pó 70%'], kcal: 190 },
              { description: 'Abacate com cacau e whey protein', items: ['80g de abacate fresco', '15g de whey protein sabor chocolate', '1 colher de sobremesa de cacau nibs'], kcal: 240 }
            ];
          } else if (meal === 'pre_workout') {
            mockPlan.meals.pre_workout = [
              { description: 'Banana com aveia e mel', items: ['1 banana prata', '2 colheres de sopa de farelo de aveia', '1 colher de sobremesa de mel de abelhas'], kcal: 160 },
              { description: 'Batata doce cozida com peito de frango', items: ['80g de batata doce cozida', '50g de peito de frango desfiado'], kcal: 180 },
              { description: 'Torrada de arroz com geleia e pasta de amendoim', items: ['2 torradas de arroz integral', '1 colher de sobremesa de pasta de amendoim', '1 colher de chá de geleia sem açúcar'], kcal: 150 }
            ];
          } else if (meal === 'post_workout') {
            mockPlan.meals.post_workout = [
              { description: 'Shake de Whey Protein com dextrose', items: ['30g de whey protein concentrado', '20g de dextrose/maltodextrina', '250ml de água de coco'], kcal: 210 },
              { description: 'Omelete de claras com arroz branco', items: ['3 claras de ovo mexidas', '2 colheres de sopa de arroz branco cozido'], kcal: 170 },
              { description: 'Sanduíche de atum funcional', items: ['2 fatias de pão de forma integral', '60g de atum em conserva ao natural', '1 colher de sopa de creme de ricota light'], kcal: 230 }
            ];
          } else if (meal === 'dinner') {
            mockPlan.meals.dinner = [
              { description: 'Filet de peixe branco grelhado com purê de mandioquinha', items: ['130g de filé de tilápia grelhado com ervas finas', '100g de purê de mandioquinha com leite de coco', 'Couve-flor assada com cúrcuma'], kcal: 450 },
              { description: 'Omelete caprese completo com salada', items: ['3 ovos caipiras batidos', '1 tomate italiano picado', '30g de muçarela de búfala', 'Folhas de manjericão fresco', 'Salada verde temperada com limão'], kcal: 420 },
              { description: 'Caldo verde funcional de mandioquinha com frango desfiado', items: ['250ml de sopa de mandioquinha com couve fatiada finamente', '100g de peito de frango cozido e desfiado', '1 fio de azeite de oliva extra virgem'], kcal: 380 }
            ];
          } else if (meal === 'supper') {
            mockPlan.meals.supper = [
              { description: 'Chá de camomila com amêndoas', items: ['1 xícara de chá de camomila quente', '6 amêndoas inteiras cruas'], kcal: 90 },
              { description: 'Kiwi com sementes de abóbora', items: ['1 kiwi grande descascado e fatiado', '1 colher de sobremesa de sementes de abóbora sem casca'], kcal: 110 },
              { description: 'Gelatina de agar-agar caseira de uva', items: ['150g de gelatina natural feita com suco de uva integral e agar-agar'], kcal: 70 }
            ];
          }
        });

        setActivePlan(mockPlan);
        setEditingTitle(`Plano Alimentar Inteligente de ${selectedPatient?.name.split(' ')[0]}`);
        setGenerating(false);
        showToast('Plano alimentar simulado gerado com sucesso com base no contexto clínico!', 'success');
      }, 3000);
      return;
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `Gere a dieta personalizada baseada neste histórico:\n\n${contextPrompt}` }]
              }
            ],
            systemInstruction: {
              role: 'system',
              parts: [{ text: systemInstruction }]
            },
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) throw new Error(`Erro na API do Gemini. Status: ${response.status}`);
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error('Retorno vazio da IA.');

      const parsedJSON: MealPlanData = JSON.parse(rawText.trim());
      setActivePlan(parsedJSON);
      setEditingTitle(`Plano Alimentar Inteligente de ${selectedPatient?.name.split(' ')[0]}`);
      showToast('Plano alimentar gerado pela IA com sucesso!', 'success');
    } catch (err: any) {
      console.error('Erro na chamada do Gemini:', err);
      showToast('Falha ao gerar plano alimentar na IA. Usando esqueleto manual como fallback.', 'error');
      handleStartManualPlan();
    } finally {
      setGenerating(false);
    }
  };

  // Update specific meal option in local state
  const handleUpdateOption = (mealKey: string, optionIdx: number, field: keyof MealOption, value: any) => {
    if (!activePlan) return;

    const updatedMeals = { ...activePlan.meals };
    const updatedOptions = [...updatedMeals[mealKey]];
    updatedOptions[optionIdx] = {
      ...updatedOptions[optionIdx],
      [field]: value
    };
    updatedMeals[mealKey] = updatedOptions;

    setActivePlan({
      ...activePlan,
      meals: updatedMeals
    });
  };

  // Edit list items within meal option
  const handleUpdateItem = (mealKey: string, optionIdx: number, itemIdx: number, value: string) => {
    if (!activePlan) return;
    const updatedMeals = { ...activePlan.meals };
    const updatedOptions = [...updatedMeals[mealKey]];
    const updatedItems = [...updatedOptions[optionIdx].items];
    updatedItems[itemIdx] = value;
    updatedOptions[optionIdx].items = updatedItems;
    updatedMeals[mealKey] = updatedOptions;

    setActivePlan({
      ...activePlan,
      meals: updatedMeals
    });
  };

  const handleAddItem = (mealKey: string, optionIdx: number) => {
    if (!activePlan) return;
    const updatedMeals = { ...activePlan.meals };
    const updatedOptions = [...updatedMeals[mealKey]];
    const updatedItems = [...updatedOptions[optionIdx].items, 'Novo alimento'];
    updatedOptions[optionIdx].items = updatedItems;
    updatedMeals[mealKey] = updatedOptions;

    setActivePlan({
      ...activePlan,
      meals: updatedMeals
    });
  };

  const handleRemoveItem = (mealKey: string, optionIdx: number, itemIdx: number) => {
    if (!activePlan) return;
    const updatedMeals = { ...activePlan.meals };
    const updatedOptions = [...updatedMeals[mealKey]];
    const updatedItems = updatedOptions[optionIdx].items.filter((_, idx) => idx !== itemIdx);
    updatedOptions[optionIdx].items = updatedItems;
    updatedMeals[mealKey] = updatedOptions;

    setActivePlan({
      ...activePlan,
      meals: updatedMeals
    });
  };

  // Save active plan to Supabase
  const handleSaveMealPlan = async () => {
    if (!activePlan || !selectedPatientId || !clinic?.id || !profile?.id) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('meal_plans')
        .insert([{
          clinic_id: clinic.id,
          patient_id: selectedPatientId,
          nutritionist_id: profile.id,
          kcal: activePlan.kcal,
          meals: activePlan.meals
        }]);

      if (error) throw error;
      showToast('Plano alimentar salvo com sucesso no prontuário do paciente!', 'success');
      
      // Reload past plans
      const { data: plansData } = await supabase
        .from('meal_plans')
        .select('id, kcal, meals, created_at')
        .eq('patient_id', selectedPatientId)
        .order('created_at', { ascending: false });

      if (plansData) setPastPlans(plansData);
      setActiveTab('history'); // Navigate to history view
    } catch (err) {
      console.error('Erro ao salvar plano alimentar:', err);
      showToast('Falha ao salvar o plano alimentar no servidor.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete past meal plan
  const handleDeletePastPlan = async (planId: string) => {
    if (isReadOnly) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('meal_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;
      showToast('Plano alimentar excluído com sucesso.', 'success');
      setPastPlans(prev => prev.filter(p => p.id !== planId));
    } catch (err) {
      console.error('Erro ao excluir plano alimentar:', err);
      showToast('Falha ao excluir o plano no servidor.', 'error');
    } finally {
      setSaving(false);
      setDeletePlanId(null);
    }
  };

  const handlePrintPlan = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col font-sans pb-12">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Construtor de Planos Alimentares
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Elabore planos alimentares enriquecidos automaticamente pelo histórico de consultas e análises de exames.
          </p>
        </div>
      </div>

      {/* SECTOR SELECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start print:block">
        
        {/* LEFT COLUMN: PARAMETERS CARD */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6.5 shadow-sm space-y-6 print:hidden">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary-655" />
              Parâmetros da Dieta
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Defina o paciente e ajuste o carregador inteligente.</p>
          </div>

          {/* Patient dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-550 uppercase tracking-wider">Paciente</label>
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
              className="block w-full rounded-2xl border-slate-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm px-4 py-3 border bg-white font-semibold text-slate-700 cursor-pointer"
            >
              <option value="">-- Selecione o Paciente --</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedPatientId && (
            <>
              {/* Contexto Clínico Detectado */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Contexto Clínico Detectado</span>
                  {loadingContext && (
                    <RefreshCw className="w-3.5 h-3.5 text-primary-600 animate-spin" />
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3.5">
                  {/* Consultation Card */}
                  <div 
                    className={`bg-[#f8fafc] border rounded-xl p-4 transition-all duration-200 ${
                      includeConsultation && !!latestConsultation
                        ? 'border-indigo-500 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 text-left">
                        <h4 className="font-semibold text-sm text-slate-900">Última Consulta</h4>
                        <p className="font-normal text-xs text-slate-500">
                          {latestConsultation 
                            ? `Consulta em ${new Date(latestConsultation.created_at).toLocaleDateString('pt-BR')}`
                            : 'Nenhuma consulta realizada encontrada para este paciente'}
                        </p>
                      </div>

                      {latestConsultation && (
                        <button
                          type="button"
                          onClick={() => setShowConsultationModal(true)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/50 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Visualizar</span>
                        </button>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className={`text-[10px] font-semibold ${latestConsultation ? 'text-slate-500' : 'text-slate-400'}`}>
                        Usar como contexto para IA
                      </span>
                      <label className={`relative inline-flex items-center select-none ${latestConsultation ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          disabled={!latestConsultation}
                          checked={includeConsultation && !!latestConsultation}
                          onChange={e => setIncludeConsultation(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className={`w-9 h-5 rounded-full peer-focus:outline-none transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${
                          latestConsultation 
                            ? 'bg-slate-200 peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-indigo-600' 
                            : 'bg-slate-200/50 opacity-50'
                        }`}></div>
                      </label>
                    </div>
                  </div>

                  {/* Exam Card */}
                  <div 
                    className={`bg-[#f8fafc] border rounded-xl p-4 transition-all duration-200 ${
                      includeExams && !!latestExam
                        ? 'border-indigo-500 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 text-left">
                        <h4 className="font-semibold text-sm text-slate-900">Último Exame</h4>
                        <p className="font-normal text-xs text-slate-500">
                          {latestExam 
                            ? `Exame em ${new Date(latestExam.exam_date || latestExam.created_at).toLocaleDateString('pt-BR')}`
                            : 'Nenhum laudo encontrado'}
                        </p>
                      </div>

                      {latestExam && (
                        <button
                          type="button"
                          onClick={() => setShowExamModal(true)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-50/50 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Visualizar</span>
                        </button>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className={`text-[10px] font-semibold ${latestExam ? 'text-slate-500' : 'text-slate-400'}`}>
                        Usar como contexto para IA
                      </span>
                      <label className={`relative inline-flex items-center select-none ${latestExam ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          disabled={!latestExam}
                          checked={includeExams && !!latestExam}
                          onChange={e => setIncludeExams(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className={`w-9 h-5 rounded-full peer-focus:outline-none transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all ${
                          latestExam 
                            ? 'bg-slate-200 peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-indigo-600' 
                            : 'bg-slate-200/50 opacity-50'
                        }`}></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuração de Meta e Refeições */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-extrabold text-slate-550 uppercase tracking-wider">Meta Calórica (kcal)</label>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-primary-750 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={suggestKcalWithAI}
                        onChange={e => setSuggestKcalWithAI(e.target.checked)}
                        className="rounded text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-slate-300"
                      />
                      Sugerir com IA
                    </label>
                  </div>
                  <input
                    type="number"
                    disabled={suggestKcalWithAI}
                    value={kcalTarget}
                    onChange={e => setKcalTarget(e.target.value)}
                    placeholder="Meta kcal..."
                    className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white font-semibold text-slate-700 disabled:opacity-50 disabled:bg-slate-50"
                  />
                  {suggestKcalWithAI && (
                    <span className="text-[10px] font-semibold text-primary-600 flex items-center gap-1 mt-1 bg-primary-50/60 p-2 rounded-lg border border-primary-100/50">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      A IA sugerirá a meta baseada na clínica e exames.
                    </span>
                  )}
                </div>

                {/* Refeições a gerar */}
                <div className="space-y-2">
                  <label className="block text-xs font-extrabold text-slate-550 uppercase tracking-wider">Refeições a Incluir</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50/50 border border-slate-100 p-3 rounded-2xl">
                    {Object.keys(MEAL_NAMES).map(mealKey => (
                      <label key={mealKey} className="flex items-center gap-2 font-bold text-[11px] text-slate-655 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={selectedMeals.includes(mealKey)}
                          onChange={() => handleToggleMeal(mealKey)}
                          className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4 border-slate-300"
                        />
                        {MEAL_NAMES[mealKey]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGenerateAIPlan}
                  disabled={generating || isReadOnly}
                  className="w-full bg-primary-600 hover:bg-primary-550 text-white font-bold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Estruturando Dieta...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4.5 h-4.5" />
                      Gerar Plano com IA
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStartManualPlan}
                  disabled={isReadOnly}
                  className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Edit className="w-4 h-4" />
                  Criar Dieta Manualmente
                </button>
              </div>
            </>
          )}
        </div>

        {/* RIGHT COLUMN: MAIN PLAN VIEWER & HISTORY */}
        <div className="lg:col-span-2 flex flex-col flex-1 h-full min-h-[500px]">
          
          {/* Patient Selector Placeholder */}
          {!selectedPatientId ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-sm flex-1 flex flex-col items-center justify-center print:hidden">
              <Apple className="h-16 w-16 text-slate-300 stroke-[1.2] mb-4.5" />
              <h3 className="text-xl font-bold text-slate-800">Carga Inteligente de Contexto</h3>
              <p className="text-slate-500 mt-2 max-w-sm text-sm font-medium leading-relaxed">
                Selecione um paciente ativo no painel lateral. Buscaremos automaticamente as últimas anotações do prontuário e exames para criar a dieta perfeita!
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden print:border-none print:shadow-none print:bg-transparent">
              
              {/* Tabs Navigation */}
              <div className="flex border-b border-slate-100 bg-slate-50/50 px-6 py-4.5 justify-between items-center shrink-0 print:hidden">
                <div className="flex p-1 bg-slate-100 rounded-xl">
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'editor' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Plano Alimentar Ativo
                  </button>
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'history' 
                        ? 'bg-white text-slate-800 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Histórico de Planos ({pastPlans.length})
                  </button>
                </div>

                {activePlan && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrintPlan}
                      className="p-2 border border-slate-200 text-slate-655 hover:bg-slate-100 rounded-xl transition-all shadow-sm shrink-0"
                      title="Imprimir Dieta / Salvar PDF"
                    >
                      <Printer className="w-4.5 h-4.5" />
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={handleSaveMealPlan}
                        disabled={saving}
                        className="bg-primary-600 hover:bg-primary-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Salvar Dieta
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* EDITOR TAB CONTENT */}
              {activeTab === 'editor' && (
                <div className="flex-1 p-6 overflow-y-auto space-y-6 print:p-0">
                  
                  {!activePlan ? (
                    <div className="text-center py-20 flex flex-col items-center justify-center flex-1 min-h-[350px]">
                      <Apple className="h-16 w-16 text-slate-355 stroke-[1.2] mb-3 animate-bounce" />
                      <h3 className="text-base font-bold text-slate-850">Montar Dieta para {selectedPatient?.name}</h3>
                      <p className="text-xs text-slate-400 max-w-xs mt-1 font-semibold">
                        Escolha uma opção no painel lateral para iniciar o cardápio: Gerar com Inteligência Artificial ou construir manualmente.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      
                      {/* Active plan header details */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4.5 gap-4">
                        <div>
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            className="text-lg font-black text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-primary-500 focus:outline-none focus:ring-0 w-full py-0.5 print:border-none print:text-2xl print:text-black"
                            placeholder="Título da Dieta"
                          />
                          <p className="text-xs font-semibold text-slate-400 mt-1 print:hidden">
                            Preencha ou ajuste os detalhes e as 3 opções de cardápios alternativos abaixo.
                          </p>
                        </div>
                        
                        <div className="bg-gradient-to-br from-[#0b0f19] to-slate-800 border border-slate-700/30 rounded-2xl px-6 py-3.5 flex items-center gap-3 shrink-0 shadow-md print:border-slate-200 print:bg-none print:bg-transparent print:text-black">
                          <div>
                            <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest block print:text-slate-500">Meta Estimada</span>
                            <span className="text-2xl font-black text-white tracking-tight print:text-black">{activePlan.kcal} <span className="text-xs font-bold text-slate-300 print:text-slate-600">kcal</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Printable header */}
                      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
                        <h1 className="text-xl font-bold text-black">{selectedPatient?.name}</h1>
                        <p className="text-xs text-slate-600">Plano Alimentar Customizado • Gerado por Nutri-AI</p>
                      </div>

                      {/* Meals list */}
                      <div className="space-y-5">
                        {Object.keys(activePlan.meals)
                          .sort((a, b) => {
                            const order = Object.keys(MEAL_NAMES);
                            return order.indexOf(a) - order.indexOf(b);
                          })
                          .map(mealKey => {
                          const options = activePlan.meals[mealKey];
                          const activeOptionIdx = optionActiveTab[mealKey] !== undefined ? optionActiveTab[mealKey] : 0;
                          const currentOption = options[activeOptionIdx] || options[0] || { description: '', items: [], kcal: 0 };

                          return (
                            <div key={mealKey} className="border border-slate-200/85 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col print:border-slate-300 print:shadow-none print:break-inside-avoid">
                              
                              {/* Meal Title Bar */}
                              <div className={`${headerTheme.bg} border-b ${headerTheme.border} px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 print:bg-transparent print:border-none`}>
                                <div className={`text-sm font-semibold ${headerTheme.text} flex items-center gap-2`}>
                                  <Clock className={`w-4 h-4 ${headerTheme.icon}`} />
                                  <span>{MEAL_NAMES[mealKey]}</span>
                                </div>
                                
                                {/* 3 Options Tab Switchers */}
                                <div className={`flex p-0.5 ${headerTheme.switcherBg} rounded-lg shrink-0 print:hidden`}>
                                  {options.map((_, optIdx) => (
                                    <button
                                      key={optIdx}
                                      onClick={() => setOptionActiveTab(prev => ({ ...prev, [mealKey]: optIdx }))}
                                      className={`px-3 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                        activeOptionIdx === optIdx 
                                          ? headerTheme.switcherActive 
                                          : headerTheme.switcherInactive
                                      }`}
                                    >
                                      Opção {optIdx + 1}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Selected Option Content Area */}
                              <div className="p-5 space-y-4">
                                
                                {/* Meal description input */}
                                <div className="space-y-1">
                                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider print:hidden">
                                    Descrição da Opção {activeOptionIdx + 1}
                                  </label>
                                  <input
                                    type="text"
                                    value={currentOption.description}
                                    onChange={e => handleUpdateOption(mealKey, activeOptionIdx, 'description', e.target.value)}
                                    placeholder="Ex: Tapioca com ovos caipiras..."
                                    className="block w-full rounded-xl border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-primary-500 focus:outline-none print:border-none print:text-sm print:font-bold print:text-black print:px-0"
                                  />
                                </div>

                                {/* Items list editor */}
                                <div className="space-y-2">
                                  <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider print:hidden">
                                    Alimentos / Componentes
                                  </label>
                                  <div className="space-y-2.5">
                                    {currentOption.items.map((item, itemIdx) => (
                                      <div key={itemIdx} className="flex items-center gap-2 print:block">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary-500 shrink-0 print:inline-block print:mr-2" />
                                        <input
                                          type="text"
                                          value={item}
                                          onChange={e => handleUpdateItem(mealKey, activeOptionIdx, itemIdx, e.target.value)}
                                          className="block flex-1 rounded-xl border-slate-150 px-3 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-primary-500 focus:outline-none print:border-none print:inline-block print:text-xs print:p-0 print:text-slate-850"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveItem(mealKey, activeOptionIdx, itemIdx)}
                                          className="text-slate-350 hover:text-red-500 p-1 rounded transition-colors print:hidden"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                    
                                    <button
                                      type="button"
                                      onClick={() => handleAddItem(mealKey, activeOptionIdx)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-655 hover:text-primary-500 pt-1.5 transition-colors print:hidden"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                      Adicionar Alimento
                                    </button>
                                  </div>
                                </div>

                                {/* Calorie input */}
                                <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between gap-4 print:pt-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider print:text-black">Calorias:</span>
                                    <div className="relative flex items-center">
                                      <input
                                        type="number"
                                        value={currentOption.kcal || 0}
                                        onChange={e => handleUpdateOption(mealKey, activeOptionIdx, 'kcal', parseInt(e.target.value) || 0)}
                                        className="min-w-[180px] w-44 rounded-xl border border-slate-200 py-2 pl-4 pr-12 text-lg font-semibold text-indigo-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition-all print:border-none print:p-0 print:text-xs print:text-slate-850"
                                      />
                                      <span className="absolute right-4 text-xs text-slate-400 font-bold pointer-events-none">kcal</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PAST PLANS TAB CONTENT */}
              {activeTab === 'history' && (
                <div className="flex-1 p-6 overflow-y-auto space-y-4 print:hidden">
                  {pastPlans.length === 0 ? (
                    <div className="text-center py-16 flex flex-col items-center justify-center">
                      <Clock className="h-12 w-12 text-slate-300 stroke-[1.2] mb-3" />
                      <h3 className="text-sm font-semibold text-slate-800">Nenhum plano anterior</h3>
                      <p className="text-xs text-slate-400 max-w-xs mt-1">
                        Não existem planos alimentares históricos salvos no prontuário de {selectedPatient?.name}.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pastPlans.map(plan => (
                        <div key={plan.id} className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200 flex items-center justify-between bg-white group gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="h-10 w-10 rounded-full bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
                              <FileText className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold text-slate-850">
                                Plano Alimentar ({plan.kcal} kcal)
                              </h4>
                              <p className="text-[11px] font-semibold text-slate-450 mt-1 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                Criado em: {new Date(plan.created_at).toLocaleDateString('pt-BR')} às {new Date(plan.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setActivePlan({
                                  kcal: plan.kcal,
                                  meals: plan.meals
                                });
                                setEditingTitle(`Plano de ${selectedPatient?.name.split(' ')[0]} - Histórico`);
                                setActiveTab('editor'); // Go back to editor to show it
                                showToast('Plano histórico restaurado no editor!', 'success');
                              }}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              Visualizar no Editor
                            </button>
                             {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => setDeletePlanId(plan.id)}
                                className="text-slate-400 hover:text-red-500 p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Excluir plano alimentar permanentemente"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
    </div>

      {/* MODAL PARA VISUALIZAR CONSULTA */}
      {showConsultationModal && latestConsultation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden animate-in scale-in duration-300">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
              <div className="space-y-0.5">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 w-fit uppercase tracking-wider">
                  Histórico de Consulta
                </span>
                <h3 className="text-lg font-semibold text-slate-900">
                  Consulta em {new Date(latestConsultation.created_at).toLocaleDateString('pt-BR')}
                </h3>
              </div>
              <button 
                onClick={() => setShowConsultationModal(false)} 
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800 border border-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Anotações de Anamnese</h4>
              <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl">
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                  {latestConsultation.anamnese_notes || "Nenhuma anotação de anamnese registrada nesta consulta."}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 p-4 shrink-0 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setShowConsultationModal(false)} 
                className="px-5 py-2 text-xs font-semibold text-slate-650 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all focus:outline-none"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL PARA VISUALIZAR EXAME (PDF) */}
      {showExamModal && latestExam && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden animate-in scale-in duration-300">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/50">
              <div className="space-y-0.5">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md text-[10px] font-semibold px-2 py-0.5 flex items-center gap-1 w-fit uppercase tracking-wider">
                  Laudo de Exame PDF
                </span>
                <h3 className="text-lg font-semibold text-slate-900">
                  Exame em {new Date(latestExam.exam_date || latestExam.created_at).toLocaleDateString('pt-BR')}
                </h3>
              </div>
              <button 
                onClick={() => setShowExamModal(false)} 
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-850 border border-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden p-6 bg-slate-50 flex flex-col">
              {loadingPdfUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-450">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-3" />
                  <p className="text-sm font-medium">Gerando link seguro de visualização do PDF...</p>
                </div>
              ) : examPdfUrl ? (
                <iframe 
                  src={`${examPdfUrl}#toolbar=0`} 
                  className="w-full h-full rounded-2xl border border-slate-250 shadow-sm"
                  title="Visualizador de PDF do Exame"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <p className="text-sm font-semibold text-rose-600">Erro ao carregar documento PDF.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 p-4 shrink-0 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setShowExamModal(false)} 
                className="px-5 py-2 text-xs font-semibold text-slate-650 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-all focus:outline-none"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PLANO */}
      {deletePlanId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 text-left">
          <div className="bg-[#f8fafc] border border-slate-200 rounded-xl shadow-xl max-w-md w-full flex flex-col overflow-hidden animate-in scale-in duration-300">
            
            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 font-semibold">
                Excluir Plano Alimentar
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed font-normal">
                Deseja mesmo excluir este plano alimentar? Esta ação não poderá ser desfeita.
              </p>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 p-4 bg-slate-50/50 flex justify-end gap-3 shrink-0">
              <button 
                type="button"
                onClick={() => setDeletePlanId(null)} 
                className="bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl py-2 px-4 font-medium text-xs transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => handleDeletePastPlan(deletePlanId)} 
                className="bg-rose-600 text-white font-medium rounded-xl py-2 px-4 hover:bg-rose-700 transition-all text-xs cursor-pointer"
              >
                Excluir
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
