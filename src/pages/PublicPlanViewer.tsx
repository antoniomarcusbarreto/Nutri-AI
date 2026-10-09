import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle2, Printer, Apple } from 'lucide-react';
import { format, parse } from 'date-fns';
import { logger } from '../lib/logger';
import { type MealOption } from '../types/mealPlan';
import { MealPlanView } from '../components/mealplan/MealPlanView';

interface PublicPlan {
  meals: Record<string, MealOption[]>;
  kcal?: number;
  nutritionist?: { name?: string | null } | null;
  patient?: { name?: string | null } | null;
}

export default function PublicPlanViewer() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PublicPlan | null>(null);
  const [birthDate, setBirthDate] = useState('');

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
      
      
    } catch (err) {
      logger.error(err);
      const message = err instanceof Error ? err.message : '';
      setError(message === 'Data de nascimento incorreta' ? 'Data de nascimento incorreta.' : 'Erro ao acessar plano. Verifique o link e a data de nascimento.');
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
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Acesso Seguro</h2>
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
                  <h2 className="text-xl font-bold text-black">{planData.patient?.name}</h2>
                  <p className="text-base text-slate-800 font-semibold mt-1">Plano Alimentar</p>
                </div>

                <MealPlanView meals={planData.meals} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
