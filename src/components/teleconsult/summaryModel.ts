import type { TeleconsultSummary } from '../../lib/teleconsult';

/**
 * Resumo da teleconsulta ↔ formulário de revisão. Listas viram texto com um
 * item por linha (mais rápido de corrigir que campos soltos); metas usam
 * "descrição — prazo".
 */
export interface SummaryForm {
  resumo_geral: string;
  queixas: string;
  historico_relevante: string;
  alimentacao: string;
  sono: string;
  atividade_fisica: string;
  hidratacao: string;
  outros: string;
  condutas: string;
  metas: string;
  pontos_atencao: string;
  proximos_passos: string;
}

const lines = (v: string[] | undefined | null) => (v ?? []).filter(Boolean).join('\n');
const toList = (v: string) => v.split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
const orNull = (v: string) => v.trim() || null;

export const EMPTY_FORM: SummaryForm = {
  resumo_geral: '', queixas: '', historico_relevante: '', alimentacao: '', sono: '', atividade_fisica: '',
  hidratacao: '', outros: '', condutas: '', metas: '', pontos_atencao: '', proximos_passos: '',
};

export function summaryToForm(s: TeleconsultSummary | null | undefined): SummaryForm {
  if (!s) return EMPTY_FORM;
  return {
    resumo_geral: s.resumo_geral ?? '',
    queixas: lines(s.queixas),
    historico_relevante: lines(s.historico_relevante),
    alimentacao: s.habitos?.alimentacao ?? '',
    sono: s.habitos?.sono ?? '',
    atividade_fisica: s.habitos?.atividade_fisica ?? '',
    hidratacao: s.habitos?.hidratacao ?? '',
    outros: s.habitos?.outros ?? '',
    condutas: lines(s.condutas),
    metas: (s.metas ?? []).map((m) => (m.prazo ? `${m.descricao} — ${m.prazo}` : m.descricao)).join('\n'),
    pontos_atencao: lines(s.pontos_atencao),
    proximos_passos: lines(s.proximos_passos),
  };
}

export function formToSummary(f: SummaryForm): TeleconsultSummary {
  return {
    resumo_geral: f.resumo_geral.trim(),
    queixas: toList(f.queixas),
    historico_relevante: toList(f.historico_relevante),
    habitos: {
      alimentacao: orNull(f.alimentacao),
      sono: orNull(f.sono),
      atividade_fisica: orNull(f.atividade_fisica),
      hidratacao: orNull(f.hidratacao),
      outros: orNull(f.outros),
    },
    condutas: toList(f.condutas),
    metas: toList(f.metas).map((line) => {
      const [descricao, ...rest] = line.split(/\s+—\s+/);
      return { descricao: descricao.trim(), prazo: rest.join(' — ').trim() || null };
    }),
    pontos_atencao: toList(f.pontos_atencao),
    proximos_passos: toList(f.proximos_passos),
  };
}

export const HABIT_LABELS: { key: keyof TeleconsultSummary['habitos'] & keyof SummaryForm; label: string }[] = [
  { key: 'alimentacao', label: 'Alimentação' },
  { key: 'sono', label: 'Sono' },
  { key: 'atividade_fisica', label: 'Atividade física' },
  { key: 'hidratacao', label: 'Hidratação' },
  { key: 'outros', label: 'Outros' },
];

export const LIST_SECTIONS: { key: 'queixas' | 'historico_relevante' | 'condutas' | 'pontos_atencao' | 'proximos_passos'; label: string }[] = [
  { key: 'queixas', label: 'Queixas' },
  { key: 'historico_relevante', label: 'Histórico relevante' },
  { key: 'condutas', label: 'Condutas' },
  { key: 'pontos_atencao', label: 'Pontos de atenção' },
  { key: 'proximos_passos', label: 'Próximos passos' },
];
