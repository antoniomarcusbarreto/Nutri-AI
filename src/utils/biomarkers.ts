import type { AiFeedback, ExamBiomarker, ExamRecord } from '../types/clinical';

/**
 * Normaliza o nome do biomarcador retornado pela visão computacional/Gemini
 * para um nome canônico consistente, evitando que variações de escrita
 * quebrem o histórico de evolução ou criem duplicatas.
 */
export const getCanonicalBiomarkerName = (name: string): string => {
  if (!name) return '';
  const lower = name.toLowerCase().trim();

  // TSH
  if (lower.includes('tsh')) {
    return 'TSH (Hormônio Tireoestimulante)';
  }

  // Anti-TPO
  if (lower.includes('anti-tpo') || lower.includes('anti - tpo') || lower.includes('peroxidase')) {
    return 'Anticorpos Anti-TPO';
  }

  // Vitamina D
  if (
    lower.includes('vitamina d') ||
    lower.includes('vit. d') ||
    lower.includes('25 hidroxi') ||
    lower.includes('25-oh') ||
    lower.includes('colecalciferol')
  ) {
    return 'Vitamina D (25-OH)';
  }

  // T4 Livre
  if (
    lower.includes('t4 livre') ||
    (lower.includes('t4') && lower.includes('livre')) ||
    lower.includes('tiroxina livre')
  ) {
    return 'T4 Livre';
  }

  // Glicose
  if (lower.includes('glicose')) {
    return 'Glicose de Jejum';
  }

  // Hemoglobina Glicada
  if (lower.includes('hba1c') || lower.includes('glicada') || lower.includes('glicosilada')) {
    return 'Hemoglobina Glicada (HbA1c)';
  }

  // Colesterol LDL
  if (lower.includes('ldl')) {
    return 'Colesterol LDL';
  }

  // Colesterol HDL
  if (lower.includes('hdl')) {
    return 'Colesterol HDL';
  }

  // Colesterol Total
  if (lower.includes('colesterol total') || (lower.includes('colesterol') && !lower.includes('ldl') && !lower.includes('hdl') && !lower.includes('vldl'))) {
    return 'Colesterol Total';
  }

  // Triglicerídeos
  if (lower.includes('triglicer') || lower.includes('triglicérides')) {
    return 'Triglicerídeos';
  }

  // Creatinina
  if (lower.includes('creatinina')) {
    return 'Creatinina';
  }

  // Ureia
  if (lower.includes('ureia') || lower.includes('uréia')) {
    return 'Ureia';
  }

  // Insulina
  if (lower.includes('insulina')) {
    return 'Insulina';
  }

  // Retorna com a primeira letra maiúscula se não bater em nenhuma regra
  return name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
};

// ---------------------------------------------------------------------------
// Evolução clínica entre exames (Onda 5 / DEBT-02 — antes duplicado em
// Exams.tsx e Consultations.tsx)
// ---------------------------------------------------------------------------

export function parseNumericValue(valStr: string): { numeric: number | null; unit: string } {
  if (!valStr) return { numeric: null, unit: '' };
  const clean = valStr.trim();
  const m = clean.match(/(-?[0-9]+([.,][0-9]+)?)/);
  if (!m) return { numeric: null, unit: '' };
  return { numeric: parseFloat(m[1].replace(',', '.')), unit: clean.replace(m[1], '').trim() };
}

export interface EvolutionIndicator { text: string; color: string; diffStr: string }

export function getEvolutionIndicator(currentValStr: string, prevValStr: string): EvolutionIndicator {
  const cur = parseNumericValue(currentValStr);
  const prev = parseNumericValue(prevValStr);
  if (cur.numeric === null || prev.numeric === null) {
    return { text: '—', color: 'text-slate-400', diffStr: '' };
  }
  const diff = cur.numeric - prev.numeric;
  const abs = Math.abs(diff).toFixed(1);
  if (diff > 0.05) return { text: '↗', color: 'text-rose-600 font-semibold', diffStr: `+${abs} ${cur.unit || ''}` };
  if (diff < -0.05) return { text: '↘', color: 'text-emerald-600 font-semibold', diffStr: `-${abs} ${cur.unit || ''}` };
  return { text: '→', color: 'text-slate-500 font-semibold', diffStr: 'Estável' };
}

/** O mesmo biomarcador no exame anterior mais recente (para comparar evolução). */
export function getPreviousExamBiomarker(
  exams: ExamRecord[],
  currentExam: ExamRecord | null | undefined,
  marcador: string,
): ExamBiomarker | null {
  if (!exams || exams.length <= 1 || !currentExam) return null;
  const curDate = new Date(currentExam.exam_date || currentExam.created_at);
  const older = exams
    .filter((e) => e.id !== currentExam.id)
    .filter((e) => new Date(e.exam_date || e.created_at) < curDate)
    .sort((a, b) =>
      new Date(b.exam_date || b.created_at).getTime() - new Date(a.exam_date || a.created_at).getTime(),
    );
  const prev = older[0];
  if (!prev?.ai_feedback?.todos_biomarcadores) return null;
  const canon = getCanonicalBiomarkerName(marcador).toLowerCase();
  return prev.ai_feedback.todos_biomarcadores.find(
    (b) => getCanonicalBiomarkerName(b.marcador).toLowerCase() === canon,
  ) ?? null;
}

/** Aplica/atualiza a nota clínica de um biomarcador, propagando para os alertas. */
export function applyBiomarkerNote(
  feedback: AiFeedback | null,
  idx: number,
  note: string,
): AiFeedback | null {
  const biomarkers = [...(feedback?.todos_biomarcadores ?? [])];
  if (!biomarkers[idx]) return feedback;
  const trimmed = note.trim();
  biomarkers[idx] = { ...biomarkers[idx], nota_clinica: trimmed };

  const alertas = [...(feedback?.alertas ?? [])];
  const aIdx = alertas.findIndex((a) => a.marcador === biomarkers[idx].marcador);
  if (aIdx !== -1) alertas[aIdx] = { ...alertas[aIdx], nota_clinica: trimmed };

  return { alertas, insights: feedback?.insights ?? '', todos_biomarcadores: biomarkers };
}
