/**
 * Tipos canônicos de plano alimentar (Onda 5 / DEBT-05).
 *
 * FORMATO OFICIAL: `items` é `string[]` — é o que a IA gera e o que o editor
 * de `MealPlans` grava. `PublicPlanViewer` usava `{ description: string }[]`;
 * a reconciliação (+ migração dos planos já salvos) é feita ao adotar este tipo.
 */
export interface MealOption {
  description: string;
  items: string[];
  kcal: number;
}

export interface MealPlanData {
  /** presente quando o plano já foi salvo / veio do banco */
  id?: string;
  kcal: number;
  meals: Record<string, MealOption[]>;
}

/** Chaves de refeição → rótulo PT-BR (era duplicado em 2 páginas). */
export const MEAL_NAMES: Record<string, string> = {
  breakfast: 'Café da Manhã',
  morning_snack: 'Lanche da Manhã',
  lunch: 'Almoço',
  afternoon_snack: 'Lanche da Tarde',
  pre_workout: 'Pré-Treino',
  post_workout: 'Pós-Treino',
  dinner: 'Jantar',
  supper: 'Ceia',
};
