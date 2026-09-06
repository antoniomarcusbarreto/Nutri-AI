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
  X,
  ShieldAlert,
  Share2,
  Copy,
  Mail,
  Smartphone
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNutritionistPatients } from '../hooks/queries/usePatients';
import { usePatientExams } from '../hooks/queries/usePatientExams';
import { useConsultations, useMealPlans } from '../hooks/queries/usePatientHistory';
import { qk } from '../lib/queryKeys';
import { generateMealPlan, GeminiError } from '../lib/gemini';
import { createExamSignedUrl } from '../lib/storage';
import { type MealOption, type MealPlanData, MEAL_NAMES } from '../types/mealPlan';
import { useDebouncedDraft } from '../hooks/useDebouncedDraft';
import { logger } from '../lib/logger';
import { pickOne } from '../types/clinical';
import type { MealPlanRecord } from '../types/clinical';

export const MealPlans: React.FC = () => {
  const { clinic, isReadOnly, profile, userRole } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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

  // Security Check: allowed only for nutritionists/owners
  const isAuthorized = userRole === 'owner' || userRole === 'nutritionist';

  // Navigation / Tab States
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');

  // Core Data States
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');

  // Dados via TanStack Query (Onda 4): lista do profissional + contexto do
  // paciente. As queries de contexto disparam EM PARALELO (fim do waterfall
  // de 3 awaits do antigo loadPatientContext).
  const { data: patients = [] } = useNutritionistPatients(profile?.id, { enabled: isAuthorized });
  const consultationsQuery = useConsultations(selectedPatientId);
  const examsQuery = usePatientExams(selectedPatientId);
  const pastPlansQuery = useMealPlans(selectedPatientId);
  const pastPlans = pastPlansQuery.data ?? [];

  const latestConsultation = useMemo(() => {
    return (consultationsQuery.data ?? []).find((c) => {
      const s = pickOne(c.appointments)?.status;
      return s !== 'cancelado' && s !== 'Cancelado';
    }) ?? null;
  }, [consultationsQuery.data]);

  const latestExam = useMemo(
    () => (examsQuery.data ?? []).find((e) => e.ai_feedback != null) ?? null,
    [examsQuery.data],
  );

  const loadingContext = !!selectedPatientId && (
    consultationsQuery.isLoading || examsQuery.isLoading || pastPlansQuery.isLoading
  );

  // Loading States
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI & Plan Parameters
  // Toggles de contexto da IA: escolha manual do usuário com fallback na
  // disponibilidade do dado (antes: 2 useEffect que forçavam setState).
  const [includeConsultationManual, setIncludeConsultationManual] = useState<boolean | null>(null);
  const [includeExamsManual, setIncludeExamsManual] = useState<boolean | null>(null);
  const includeConsultation = includeConsultationManual ?? !!latestConsultation;
  const includeExams = includeExamsManual ?? !!latestExam;
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);

  // Signed URL do PDF do último exame (só quando o modal abre) — via TanStack
  // Query, sem efeito com setState (Onda 4/6).
  const examModalFileUrl = showExamModal ? latestExam?.file_url : undefined;
  const {
    data: examPdfUrl = null,
    isFetching: loadingPdfUrl,
    error: examPdfError,
  } = useQuery({
    queryKey: ['exam-signed-url', examModalFileUrl],
    enabled: !!examModalFileUrl,
    staleTime: 50 * 60 * 1000,
    queryFn: () => createExamSignedUrl(examModalFileUrl as string),
  });

  useEffect(() => {
    if (examPdfError) {
      logger.error('Erro ao gerar URL assinada para exame:', examPdfError);
      showToast('Não foi possível carregar o PDF do exame.', 'error');
    }
  }, [examPdfError, showToast]);

  // Seleção inicial de paciente (preferência em localStorage).
  useEffect(() => {
    if (selectedPatientId || patients.length === 0) return;
    const stored = localStorage.getItem('nutri-ai:selected-patient-id');
    const initialId = patients.some((p) => p.id === stored) ? (stored as string) : patients[0].id;
    // Bootstrap único: sincroniza a seleção com a lista assim que ela carrega.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedPatientId(initialId);
    localStorage.setItem('nutri-ai:selected-patient-id', initialId);
  }, [patients, selectedPatientId]);

  // Ao trocar de paciente: reinicia o editor e restaura o rascunho local daquele
  // paciente. É a sincronização legítima de estado com uma chave externa
  // (selectedPatientId) — o `react-hooks/set-state-in-effect` do plugin v7 dá
  // falso-positivo aqui (não há cascata: só roda quando o paciente muda).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedPatientId) {
      setActivePlan(null);
      return;
    }
    const initialTabs: { [key: string]: number } = {};
    Object.keys(MEAL_NAMES).forEach(m => { initialTabs[m] = 0; });
    setOptionActiveTab(initialTabs);

    const draftStr = localStorage.getItem(`nutriai_draft_plano_${selectedPatientId}`);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setActivePlan(draft.activePlan || null);
        setEditingTitle(draft.editingTitle || 'Plano Alimentar Inteligente');
      } catch {
        setActivePlan(null);
        setEditingTitle('Plano Alimentar Inteligente');
      }
    } else {
      setActivePlan(null);
      setEditingTitle('Plano Alimentar Inteligente');
    }
  }, [selectedPatientId]);
  /* eslint-enable react-hooks/set-state-in-effect */


  // Erro de qualquer query de contexto.
  useEffect(() => {
    if (consultationsQuery.error || examsQuery.error || pastPlansQuery.error) {
      showToast('Erro ao buscar histórico clínico.', 'error');
    }
  }, [consultationsQuery.error, examsQuery.error, pastPlansQuery.error, showToast]);

  // Auto-save de rascunho com debounce (PERF-10)
  useDebouncedDraft(
    selectedPatientId ? `nutriai_draft_plano_${selectedPatientId}` : null,
    { activePlan, editingTitle },
    { isEmpty: (v) => !v.activePlan },
  );

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
  const handleStartManualPlan = (isFallback = false) => {
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
    if (!isFallback) {
      showToast('Estrutura de plano alimentar criada para preenchimento manual.', 'success');
    }
  };

  // Trigger Gemini AI Generation with Context
  const handleGenerateAIPlan = async () => {
    if (!selectedPatientId || !clinic?.id || !profile?.id) return;
    setGenerating(true);
    showToast('A IA está analisando o histórico e estruturando a dieta...', 'info');

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
        alerts.forEach((a) => {
          contextPrompt += `- ${a.marcador}: ${a.valor} (Referência: ${a.referencia}) [Gravidade: ${a.gravidade ?? 'n/d'}]\n`;
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

    try {
      const parsedJSON = await generateMealPlan(contextPrompt);
      setActivePlan(parsedJSON);
      if (suggestKcalWithAI && parsedJSON.kcal) {
        setKcalTarget(parsedJSON.kcal.toString());
      }
      setEditingTitle(`Plano Alimentar Inteligente de ${selectedPatient?.name.split(' ')[0]}`);
      showToast('Plano alimentar gerado pela IA com sucesso!', 'success');
    } catch (err) {
      logger.error('Erro na geração do plano:', err);
      const msg = err instanceof GeminiError ? err.message : 'Erro desconhecido';
      showToast(`Falha na IA: ${msg}. Usando modo manual.`, 'error');
      handleStartManualPlan(true);
    } finally {
      setGenerating(false);
    }
  };


  // Update specific meal option in local state
  const handleUpdateOption = <K extends keyof MealOption>(
    mealKey: string,
    optionIdx: number,
    field: K,
    value: MealOption[K],
  ) => {
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
      
      // Clean draft from localStorage on success
      localStorage.removeItem(`nutriai_draft_plano_${selectedPatientId}`);
      setActivePlan(null);

      // Recarrega os planos do cache (TanStack Query)
      await queryClient.invalidateQueries({ queryKey: qk.mealPlans.byPatient(selectedPatientId) });
      setActiveTab('history'); // Navigate to history view
    } catch (err) {
      logger.error('Erro ao salvar plano alimentar:', err);
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
      queryClient.setQueryData<MealPlanRecord[]>(
        qk.mealPlans.byPatient(selectedPatientId),
        (prev) => prev?.filter(p => p.id !== planId) ?? prev,
      );
    } catch (err) {
      logger.error('Erro ao excluir plano alimentar:', err);
      showToast('Falha ao excluir o plano no servidor.', 'error');
    } finally {
      setSaving(false);
      setDeletePlanId(null);
    }
  };

  const handleShareClick = () => {
    if (!activePlan?.id) {
      showToast('Por favor, salve a dieta antes de compartilhar.', 'error');
      return;
    }
    setShowShareModal(true);
  };

  const shareText = `Olá, ${selectedPatient?.name?.split(' ')[0]}! Seu novo plano alimentar está pronto. Acesse através do link seguro: ${window.location.origin}/plano/${activePlan?.id}\n(Sua senha de acesso é a sua data de nascimento).`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/plano/${activePlan?.id}`);
    showToast('Link copiado para a área de transferência!', 'success');
  };

  const handleWhatsAppShare = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const handleEmailShare = () => {
    window.open(`mailto:${selectedPatient?.email || ''}?subject=${encodeURIComponent('Seu Plano Alimentar - Nutri-AI')}&body=${encodeURIComponent(shareText)}`, '_self');
  };

  const handlePrintPlan = () => {
    window.print();
  };

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-[500px] p-6 animate-in fade-in duration-300">
        <div className="bg-white border border-slate-200 p-8 rounded-xl shadow-sm text-center max-w-lg flex flex-col items-center">
          <div className="h-16 w-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center border border-rose-100 mb-4 animate-bounce">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">Acesso Restrito a Nutricionistas</h2>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed">
            Desculpe, o módulo de <strong>Construção de Planos Alimentares</strong> é de uso estritamente restrito a nutricionistas autorizados.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 h-full flex flex-col font-sans pb-12 print:!h-auto print:!block">
      
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

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 relative print:block print:w-full">
        
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
                          onChange={e => setIncludeConsultationManual(e.target.checked)}
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
                          onChange={e => setIncludeExamsManual(e.target.checked)}
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
                  onClick={() => handleStartManualPlan()}
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
        <div className="lg:col-span-2 flex flex-col flex-1 h-full min-h-[500px] print:!h-auto print:!block">
          
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
            <div className="flex flex-col flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden print:!border-none print:!shadow-none print:!rounded-none print:!overflow-visible">
              
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
                            onClick={handleShareClick}
                            className="p-2 border border-slate-200 text-slate-655 hover:bg-slate-100 rounded-xl transition-all shadow-sm shrink-0"
                            title="Compartilhar Link Seguro"
                          >
                            <Share2 className="w-4.5 h-4.5" />
                          </button>
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
                      <div className="flex-1 p-6 overflow-y-auto space-y-6 print:p-0 print:!overflow-visible print:!h-auto">
                        
                        {!activePlan ? (
                          <div className="text-center py-20 flex flex-col items-center justify-center flex-1 min-h-[350px]">
                            <Apple className="h-16 w-16 text-slate-355 stroke-[1.2] mb-3 animate-bounce" />
                            <h3 className="text-base font-bold text-slate-850">Montar Dieta para {selectedPatient?.name}</h3>
                            <p className="text-xs text-slate-400 max-w-xs mt-1 font-semibold">
                              Escolha uma opção no painel lateral para iniciar o cardápio: Gerar com Inteligência Artificial ou construir manualmente.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-6 print:table print:w-full print:!bg-white">
                            <div className="hidden print:table-header-group">
                              <div className="h-[20mm] bg-white"></div>
                            </div>
                            <div className="hidden print:table-footer-group">
                              <div className="h-[20mm] bg-white"></div>
                            </div>
                            <div className="print:table-row-group">
                              <div className="print:table-row">
                                <div className="print:table-cell space-y-6 print:px-[20mm] print:!bg-white print:align-top">
                            
                            {/* Active plan header details */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4.5 gap-4 print:!hidden">
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
                              
                              <div className="bg-gradient-to-br from-[#0b0f19] to-slate-800 border border-slate-700/30 rounded-2xl px-6 py-3.5 flex items-center gap-3 shrink-0 shadow-md">
                                <div>
                                  <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest block">Meta Estimada</span>
                                  <span className="text-2xl font-black text-white tracking-tight">{activePlan.kcal} <span className="text-xs font-bold text-slate-300">kcal</span></span>
                                </div>
                              </div>
                            </div>

                            {/* Printable header */}
                            <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
                              <h1 className="text-xl font-bold text-black">{selectedPatient?.name}</h1>
                              <p className="text-base text-slate-800 font-semibold mt-1">Plano Alimentar</p>
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
                                  <div key={mealKey} className="border border-slate-200/85 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col print:border-slate-300 print:shadow-none print:!overflow-visible">
                                    
                                    {/* Meal Title Bar */}
                                    <div className={`${headerTheme.bg} border-b ${headerTheme.border} px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0`}>
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
                                          className="block w-full rounded-xl border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-primary-500 focus:outline-none print:!border-none print:!bg-transparent print:!shadow-none print:text-sm print:font-bold print:text-black print:px-0"
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
                                                className="block flex-1 rounded-xl border-slate-150 px-3 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-primary-500 focus:outline-none print:!border-none print:!bg-transparent print:!shadow-none print:inline-block print:text-xs print:p-0 print:text-slate-850"
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
                                              className="min-w-[180px] w-44 rounded-xl border border-slate-200 py-2 pl-4 pr-12 text-lg font-semibold text-indigo-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none transition-all print:!border-none print:!bg-transparent print:p-0 print:text-xs print:text-slate-850"
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
                              </div>
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

      {/* MODAL DE COMPARTILHAMENTO */}
      {showShareModal && activePlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden animate-in scale-in duration-300">
            <div className="p-6 text-center border-b border-slate-100">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Compartilhar Plano</h3>
              <p className="text-sm text-slate-500 mt-1">
                O plano será protegido pela data de nascimento de {selectedPatient?.name.split(' ')[0]}.
              </p>
            </div>
            <div className="p-6 space-y-3 bg-slate-50/50">
              <button onClick={handleWhatsAppShare} className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-green-500 hover:ring-1 hover:ring-green-500 rounded-xl transition-all shadow-sm group text-left">
                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Enviar por WhatsApp</p>
                  <p className="text-xs text-slate-500">Abre mensagem com link seguro</p>
                </div>
              </button>

              <button onClick={handleEmailShare} className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-blue-500 hover:ring-1 hover:ring-blue-500 rounded-xl transition-all shadow-sm group text-left">
                <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Enviar por E-mail</p>
                  <p className="text-xs text-slate-500">Usa o seu app de e-mail padrão</p>
                </div>
              </button>

              <button onClick={handleCopyLink} className="w-full flex items-center gap-3 p-4 bg-white border border-slate-200 hover:border-slate-400 hover:ring-1 hover:ring-slate-400 rounded-xl transition-all shadow-sm group text-left">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 group-hover:scale-110 transition-transform">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Copiar Link</p>
                  <p className="text-xs text-slate-500">{window.location.origin}/plano/{activePlan.id}</p>
                </div>
              </button>
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
              <button onClick={() => setShowShareModal(false)} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
