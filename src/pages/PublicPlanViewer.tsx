import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, Clock, CheckCircle2, FileText, Printer, Apple } from 'lucide-react';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MealItem {
  description: string;
}

interface MealOption {
  description: string;
  items: MealItem[];
  kcal: number;
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

const getHeaderTheme = (mealKey: string) => {
  if (['breakfast', 'morning_snack'].includes(mealKey)) {
    return {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      icon: 'text-amber-600',
      border: 'border-amber-100',
      switcherBg: 'bg-amber-100/50',
      switcherActive: 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200',
      switcherInactive: 'text-amber-600/70 hover:text-amber-700 hover:bg-amber-100/50'
    };
  }
  if (['lunch', 'dinner'].includes(mealKey)) {
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      icon: 'text-blue-600',
      border: 'border-blue-100',
      switcherBg: 'bg-blue-100/50',
      switcherActive: 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200',
      switcherInactive: 'text-blue-600/70 hover:text-blue-700 hover:bg-blue-100/50'
    };
  }
  if (['pre_workout', 'post_workout'].includes(mealKey)) {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      icon: 'text-emerald-600',
      border: 'border-emerald-100',
      switcherBg: 'bg-emerald-100/50',
      switcherActive: 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-200',
      switcherInactive: 'text-emerald-600/70 hover:text-emerald-700 hover:bg-emerald-100/50'
    };
  }
  return {
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    icon: 'text-indigo-600',
    border: 'border-indigo-100',
    switcherBg: 'bg-indigo-100/50',
    switcherActive: 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200',
    switcherInactive: 'text-indigo-600/70 hover:text-indigo-700 hover:bg-indigo-100/50'
  };
};

export default function PublicPlanViewer() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planData, setPlanData] = useState<any | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [optionActiveTab, setOptionActiveTab] = useState<{ [key: string]: number }>({});

  const formatDOB = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 2) return v;
    if (v.length <= 4) return `${v.slice(0, 2)}/${v.slice(2)}`;
    return `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4, 8)}`;
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (birthDate.length !== 10) {
        throw new Error('Formato inválido. Use DD/MM/AAAA');
      }

      // Converte DD/MM/AAAA para YYYY-MM-DD
      const parsedDate = parse(birthDate, 'dd/MM/yyyy', new Date());
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Data inválida.');
      }
      const isoDate = format(parsedDate, 'yyyy-MM-dd');

      const { data, error: rpcError } = await supabase.rpc('get_patient_meal_plan', {
        p_plan_id: id,
        p_birth_date: isoDate
      });

      if (rpcError) throw rpcError;
      if (!data) throw new Error('Plano não encontrado.');

      setPlanData(data);
      
      // Initialize tabs
      const initialTabs: { [key: string]: number } = {};
      Object.keys(data.meals || {}).forEach(m => {
        initialTabs[m] = 0;
      });
      setOptionActiveTab(initialTabs);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message === 'Data de nascimento incorreta' ? 'Data de nascimento incorreta.' : 'Erro ao acessar plano. Verifique o link e a data de nascimento.');
    } finally {
      setLoading(false);
    }
  };

  if (!planData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 p-8 border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="mx-auto w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Acesso Seguro</h1>
          <p className="text-sm text-slate-500 mb-8">
            Para visualizar seu plano alimentar, por favor confirme sua data de nascimento.
          </p>

          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <input
                type="text"
                value={birthDate}
                onChange={e => setBirthDate(formatDOB(e.target.value))}
                placeholder="DD/MM/AAAA"
                className="w-full text-center text-lg font-semibold tracking-widest px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none transition-all"
                maxLength={10}
                required
              />
            </div>
            
            {error && (
              <p className="text-sm font-semibold text-rose-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || birthDate.length < 10}
              className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
            >
              {loading ? 'Verificando...' : 'Acessar Plano Alimentar'}
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Ambiente Seguro</span>
          </div>
        </div>
      </div>
    );
  }

  // Render the Plan
  return (
    <div className="min-h-screen bg-[#f8fafc] print:bg-white font-sans text-slate-800">
      
      {/* Top Navigation Bar - Hidden in print */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 print:hidden shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-inner">
            <Apple className="w-6 h-6 text-white stroke-[1.5]" />
          </div>
          <div>
            <h1 className="font-bold text-slate-800">Plano Alimentar</h1>
            <p className="text-xs font-semibold text-slate-500">{planData.nutritionist?.name}</p>
          </div>
        </div>
        
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold text-sm transition-all shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span className="hidden sm:inline">Imprimir PDF</span>
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-8 print:p-0">
        
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
                
                {/* Printable header */}
                <div className="hidden print:block border-b border-slate-300 pb-4 mb-4">
                  <h1 className="text-xl font-bold text-black">{planData.patient?.name}</h1>
                  <p className="text-base text-slate-800 font-semibold mt-1">Plano Alimentar</p>
                </div>

                {/* Meals list */}
                <div className="space-y-5">
                  {Object.keys(planData.meals)
                    .sort((a, b) => {
                      const order = Object.keys(MEAL_NAMES);
                      return order.indexOf(a) - order.indexOf(b);
                    })
                    .map(mealKey => {
                    const options = planData.meals[mealKey];
                    const activeOptionIdx = optionActiveTab[mealKey] !== undefined ? optionActiveTab[mealKey] : 0;
                    const currentOption = options[activeOptionIdx] || options[0] || { description: '', items: [], kcal: 0 };
                    const headerTheme = getHeaderTheme(mealKey);

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
                                OPÇÃO {optIdx + 1}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Selected Option Content Area */}
                        <div className="p-5 space-y-4">
                          
                          {/* Option Description Input */}
                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 print:hidden">
                              Descrição da Opção {activeOptionIdx + 1}
                            </label>
                            <p className="text-sm font-semibold text-slate-700 bg-transparent border-none py-1.5">
                              {currentOption.description || `Opção ${activeOptionIdx + 1}`}
                            </p>
                          </div>

                          {/* Items List */}
                          <div>
                            <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                              Alimentos / Componentes
                            </label>
                            <ul className="space-y-2">
                              {currentOption.items?.map((item: any, itemIdx: number) => (
                                <li key={itemIdx} className="flex gap-3 text-sm text-slate-600 font-medium group">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"></span>
                                  <p>{item.description}</p>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Kcal Footer */}
                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Calorias:</span>
                            <div className="flex items-baseline gap-1">
                              <span className="text-sm font-bold text-slate-700">{currentOption.kcal || 0}</span>
                              <span className="text-xs font-semibold text-slate-400">kcal</span>
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
      </div>
    </div>
  );
}
