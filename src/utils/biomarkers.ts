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
