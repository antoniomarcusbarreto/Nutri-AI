import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { type MealOption, MEAL_NAMES, sortMealKeys } from '../../types/mealPlan';

/**
 * Plano alimentar só leitura: uma faixa por refeição, com as opções
 * alternáveis. Usado pelo link público (/plano/:id) e pelo Portal do Paciente.
 */

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

export interface MealPlanViewProps {
  meals: Record<string, MealOption[]>;
  /** Mostra só estas refeições (ex.: a refeição do horário atual). */
  only?: string[];
}

export const MealPlanView: React.FC<MealPlanViewProps> = ({ meals, only }) => {
  const [optionActiveTab, setOptionActiveTab] = useState<Record<string, number>>({});
  const keys = sortMealKeys(meals).filter((k) => !only || only.includes(k));

  return (
    <div className="space-y-5">
      {keys.map(mealKey => {
        const options: MealOption[] = meals[mealKey] || [];
        const activeOptionIdx = optionActiveTab[mealKey] ?? 0;
        const currentOption: MealOption = options[activeOptionIdx] || options[0] || { description: '', items: [], kcal: 0 };
        const headerTheme = getHeaderTheme(mealKey);

        return (
          <div key={mealKey} className="border border-slate-200/85 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col print:border-slate-300 print:shadow-none print:!overflow-visible">

            {/* Meal Title Bar */}
            <div className={`${headerTheme.bg} border-b ${headerTheme.border} px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0`}>
              <h3 className={`text-sm font-semibold ${headerTheme.text} flex items-center gap-2`}>
                <Clock className={`w-4 h-4 ${headerTheme.icon}`} aria-hidden="true" />
                <span>{MEAL_NAMES[mealKey] ?? mealKey}</span>
              </h3>

              {options.length > 1 && (
                <div className={`flex p-0.5 ${headerTheme.switcherBg} rounded-lg shrink-0 self-start sm:self-auto print:hidden`} role="group" aria-label={`Opções de ${MEAL_NAMES[mealKey] ?? mealKey}`}>
                  {options.map((_opt, optIdx) => (
                    <button
                      key={optIdx}
                      type="button"
                      aria-pressed={activeOptionIdx === optIdx}
                      onClick={() => setOptionActiveTab(prev => ({ ...prev, [mealKey]: optIdx }))}
                      className={`px-3 py-1.5 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        activeOptionIdx === optIdx
                          ? headerTheme.switcherActive
                          : headerTheme.switcherInactive
                      }`}
                    >
                      Opção {optIdx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Option Content Area */}
            <div className="p-5 space-y-4">
              <p className="text-sm font-semibold text-slate-700">
                {currentOption.description || `Opção ${activeOptionIdx + 1}`}
              </p>

              <ul className="space-y-2">
                {currentOption.items?.map((item, itemIdx: number) => (
                  <li key={itemIdx} className="flex gap-3 text-sm text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" aria-hidden="true"></span>
                    {/* `items` é string[] (formato da IA/editor) — DEBT-05 */}
                    <p>{typeof item === 'string' ? item : (item as unknown as { description?: string }).description}</p>
                  </li>
                ))}
              </ul>

              {currentOption.kcal > 0 && (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Calorias</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-slate-700 tabular-nums">{currentOption.kcal}</span>
                    <span className="text-xs text-slate-500">kcal</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
