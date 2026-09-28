/**
 * Cor por domínio na página de Acompanhamento. Cada tipo de dado tem UMA cor,
 * repetida em ícones, filtros, marcadores e gráficos — o olho aprende o código
 * uma vez e o reaproveita na página inteira. As famílias seguem o Dashboard
 * (Consultas = teal, Planos = âmbar) e só usam tons `-50` que o `.theme-dark`
 * do index.css remapeia.
 */
export const DOMAIN = {
  consultation: {
    solid: '#0d9488',
    plate: 'bg-teal-50 text-teal-700 border-teal-100',
    dot: 'bg-teal-600 text-white',
    text: 'text-teal-700',
    chipOn: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  exam: {
    solid: '#2563eb',
    plate: 'bg-blue-50 text-blue-700 border-blue-100',
    dot: 'bg-blue-600 text-white',
    text: 'text-blue-700',
    chipOn: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  mealplan: {
    solid: '#d97706',
    plate: 'bg-amber-50 text-amber-700 border-amber-100',
    dot: 'bg-amber-500 text-white',
    text: 'text-amber-700',
    chipOn: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  metrics: {
    solid: '#5024fc',
    plate: 'bg-indigo-50 text-[#5024fc] border-indigo-100',
    dot: 'bg-[#5024fc] text-white',
    text: 'text-[#5024fc]',
    chipOn: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  },
} as const;

/** Tom de um indicador: a cor de status só aparece junto de número + rótulo. */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'info';

export const TONE_TILE: Record<Tone, { tile: string; value: string }> = {
  good: { tile: 'bg-emerald-50 border-emerald-100', value: 'text-emerald-700' },
  warn: { tile: 'bg-amber-50 border-amber-100', value: 'text-amber-700' },
  bad: { tile: 'bg-rose-50 border-rose-100', value: 'text-rose-700' },
  info: { tile: 'bg-teal-50 border-teal-100', value: 'text-teal-700' },
  neutral: { tile: 'bg-white border-slate-200', value: 'text-slate-900' },
};
