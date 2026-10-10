/**
 * Diário de refeições (migration 0036) — tipos e contas.
 *
 * Regra que evita o bug do DoseCerta (macros escalados duas vezes):
 *   - `items` e `base_macros` são SEMPRE o prato inteiro;
 *   - `macros` é o CONSUMIDO (base × consumed_pct), calculado UMA vez ao salvar;
 *   - a tela mostra `macros` direto e só anota "comeu 50%" — nunca reescala.
 */
import { MEAL_NAMES } from '../types/mealPlan';

export interface MealItem {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type MealStatus = 'analyzing' | 'pending' | 'completed' | 'error';
export type Adherence = 'segue_o_plano' | 'parcial' | 'fora_do_plano' | 'sem_plano';

export interface MealLog {
  id: string;
  patient_id: string;
  clinic_id: string;
  source: 'foto' | 'texto';
  photo_path: string | null;
  description: string | null;
  meal_key: string | null;
  eaten_at: string;
  status: MealStatus;
  analysis_error: string | null;
  items: MealItem[];
  base_macros: Macros | null;
  macros: Macros | null;
  ai_feedback: string | null;
  adherence: Adherence | null;
  consumed_pct: number | null;
  created_at: string;
}

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export const sumItems = (items: MealItem[]): Macros =>
  items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (Number(it.calories) || 0),
      protein: acc.protein + (Number(it.protein) || 0),
      carbs: acc.carbs + (Number(it.carbs) || 0),
      fat: acc.fat + (Number(it.fat) || 0),
    }),
    EMPTY_MACROS,
  );

export const scaleMacros = (m: Macros, pct: number): Macros => ({
  kcal: Math.round(m.kcal * pct),
  protein: Math.round(m.protein * pct),
  carbs: Math.round(m.carbs * pct),
  fat: Math.round(m.fat * pct),
});

export const addMacros = (a: Macros, b: Macros | null | undefined): Macros =>
  b ? { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat } : a;

export const CONSUMPTION = [
  { pct: 1, label: 'Comi tudo', short: '100%' },
  { pct: 0.5, label: 'Comi metade', short: '50%' },
  { pct: 0.25, label: 'Comi pouco', short: '25%' },
] as const;

export const ADHERENCE: Record<Adherence, { label: string; className: string }> = {
  segue_o_plano: { label: 'Segue o plano', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  parcial: { label: 'Parcialmente no plano', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  fora_do_plano: { label: 'Fora do plano', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  sem_plano: { label: 'Sem plano', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

/** Refeição do plano mais provável para um horário (minutos desde 00:00). */
const MEAL_WINDOWS: [number, string][] = [
  [9 * 60 + 30, 'breakfast'],
  [11 * 60 + 30, 'morning_snack'],
  [14 * 60 + 30, 'lunch'],
  [17 * 60 + 30, 'afternoon_snack'],
  [20 * 60 + 30, 'dinner'],
  [24 * 60, 'supper'],
];

export function mealKeyForTime(date: Date, available?: string[]): string {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const target = (MEAL_WINDOWS.find(([limit]) => minutes < limit) ?? MEAL_WINDOWS[0])[1];
  if (!available || available.length === 0 || available.includes(target)) return target;
  const order = Object.keys(MEAL_NAMES);
  return available.find((k) => order.indexOf(k) > order.indexOf(target)) ?? available[0];
}

export const mealLabel = (key: string | null) => (key ? MEAL_NAMES[key] ?? key : 'Refeição');
