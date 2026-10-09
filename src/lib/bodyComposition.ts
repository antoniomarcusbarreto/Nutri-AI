/**
 * Motor de composição corporal (avaliação por fita/fotos — migration 0034).
 *
 * Tudo aqui é cálculo a partir de peso, altura, sexo, % de gordura e
 * perímetros. Conferido contra um relatório de referência (mulher, 1,62 m,
 * 108 kg, cintura 125,3, quadril 131,7, 51,6% de gordura): massa gorda 55,7,
 * massa magra 52,3, IMC 41,2, IMM 19,9, IMG 21,2, RCE 0,77, RCQ 0,95,
 * conicidade 1,41, gasto de repouso ≈1650 kcal.
 *
 * % de gordura sem valor informado: RFM (Relative Fat Mass, Woolcott &
 * Bergman 2018, validado contra DXA) = 64 − 20 × altura/cintura (+12 mulheres).
 *
 * Faixas femininas: as do relatório de referência. Masculinas: referências da
 * literatura (OMS para cintura/RCQ; Kyle 2003 para IMM/IMG).
 */

export type Sex = 'F' | 'M';
export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface BodyInputs {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number | null;
  armCm?: number | null;
  forearmCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  thighCm?: number | null;
  calfCm?: number | null;
}

export interface Band {
  /** Limite superior (exclusivo) da faixa; a última faixa vai até o infinito. */
  upTo: number | null;
  label: string;
  tone: Tone;
}

export interface Indicator {
  key: string;
  label: string;
  value: number;
  unit: string;
  decimals: number;
  bands: Band[] | null;
  /** Faixa em que o valor caiu (null quando não há classificação). */
  band: Band | null;
  hint?: string;
}

export interface BodyResult {
  bodyFatPct: number | null;
  /** De onde veio o % de gordura. */
  fatSource: 'informado' | 'rfm' | null;
  fatMassKg: number | null;
  leanMassKg: number | null;
  waterL: number | null;
  restingKcal: number | null;
  bmi: number;
  indicators: Indicator[];
  /** Índice próprio 0–100 a partir dos indicadores (não é o score da Shaped). */
  score: number | null;
}

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Relative Fat Mass. */
export function rfm(sex: Sex, heightCm: number, waistCm: number): number {
  return round((sex === 'F' ? 76 : 64) - 20 * (heightCm / waistCm), 1);
}

const BANDS: Record<string, Record<Sex, Band[] | null>> = {
  fat: {
    F: [
      { upTo: 17.8, label: 'Atenção', tone: 'warn' },
      { upTo: 26.4, label: 'Baixo risco', tone: 'good' },
      { upTo: 29.9, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
    M: [
      { upTo: 8, label: 'Atenção', tone: 'warn' },
      { upTo: 20, label: 'Baixo risco', tone: 'good' },
      { upTo: 25, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
  },
  bmi: {
    F: [
      { upTo: 18.5, label: 'Baixo peso', tone: 'warn' },
      { upTo: 25, label: 'Eutrofia', tone: 'good' },
      { upTo: 30, label: 'Sobrepeso', tone: 'warn' },
      { upTo: null, label: 'Obesidade', tone: 'bad' },
    ],
    M: null,
  },
  ffmi: {
    F: [
      { upTo: 13.8, label: 'Baixo', tone: 'bad' },
      { upTo: 17.3, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Alto', tone: 'good' },
    ],
    M: [
      { upTo: 16.7, label: 'Baixo', tone: 'bad' },
      { upTo: 19.7, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Alto', tone: 'good' },
    ],
  },
  fmi: {
    F: [
      { upTo: 3.4, label: 'Baixo', tone: 'warn' },
      { upTo: 6.5, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Alto', tone: 'bad' },
    ],
    M: [
      { upTo: 1.8, label: 'Baixo', tone: 'warn' },
      { upTo: 5.2, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Alto', tone: 'bad' },
    ],
  },
  waist: {
    F: [
      { upTo: 80, label: 'Baixo risco', tone: 'good' },
      { upTo: 88, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
    M: [
      { upTo: 94, label: 'Baixo risco', tone: 'good' },
      { upTo: 102, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
  },
  hip: {
    F: [
      { upTo: 97.6, label: 'Atenção', tone: 'warn' },
      { upTo: 107.7, label: 'Baixo risco', tone: 'good' },
      { upTo: 112.8, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
    M: null,
  },
  whtr: {
    F: [
      { upTo: 0.5, label: 'Baixo risco', tone: 'good' },
      { upTo: 0.55, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
    M: [
      { upTo: 0.5, label: 'Baixo risco', tone: 'good' },
      { upTo: 0.55, label: 'Moderado', tone: 'warn' },
      { upTo: null, label: 'Alto risco', tone: 'bad' },
    ],
  },
  whr: {
    F: [
      { upTo: 0.85, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Inadequado', tone: 'bad' },
    ],
    M: [
      { upTo: 0.9, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Inadequado', tone: 'bad' },
    ],
  },
  conicity: {
    F: [
      { upTo: 1.18, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Inadequado', tone: 'bad' },
    ],
    M: [
      { upTo: 1.25, label: 'Adequado', tone: 'good' },
      { upTo: null, label: 'Inadequado', tone: 'bad' },
    ],
  },
};
// IMC: mesmas faixas para os dois sexos.
BANDS.bmi.M = BANDS.bmi.F;

export function bandFor(bands: Band[] | null, value: number): Band | null {
  if (!bands) return null;
  return bands.find((b) => b.upTo === null || value < b.upTo) ?? null;
}

function indicator(key: string, label: string, value: number, unit: string, decimals: number, sex: Sex, hint?: string): Indicator {
  const bands = BANDS[key]?.[sex] ?? null;
  return { key, label, value: round(value, decimals), unit, decimals, bands, band: bandFor(bands, value), hint };
}

/** Indicadores usados no índice próprio (peso: bom 1, atenção 0,5, ruim 0). */
const SCORED = ['fat', 'ffmi', 'fmi', 'whtr', 'whr', 'conicity'];

export function computeBody(input: BodyInputs): BodyResult {
  const { sex, heightCm, weightKg } = input;
  const h = heightCm / 100;
  const waist = input.waistCm ?? null;
  const hip = input.hipCm ?? null;

  let bodyFatPct: number | null = input.bodyFatPct ?? null;
  let fatSource: BodyResult['fatSource'] = bodyFatPct != null ? 'informado' : null;
  if (bodyFatPct == null && waist) {
    bodyFatPct = rfm(sex, heightCm, waist);
    fatSource = 'rfm';
  }

  const fatMassKg = bodyFatPct != null ? weightKg * (bodyFatPct / 100) : null;
  const leanMassKg = fatMassKg != null ? weightKg - fatMassKg : null;
  const bmi = weightKg / (h * h);

  const indicators: Indicator[] = [indicator('bmi', 'IMC', bmi, 'kg/m²', 1, sex)];
  if (bodyFatPct != null && fatMassKg != null && leanMassKg != null) {
    indicators.push(
      indicator('fat', 'Percentual de gordura', bodyFatPct, '%', 1, sex,
        'Classifica risco cardiometabólico; não tem fim estético.'),
      indicator('ffmi', 'Índice de massa magra', leanMassKg / (h * h), 'kg/m²', 1, sex,
        'Massa magra em relação à altura.'),
      indicator('fmi', 'Índice de massa gorda', fatMassKg / (h * h), 'kg/m²', 1, sex,
        'Massa gorda em relação à altura.'),
    );
  }
  if (waist) {
    indicators.push(
      indicator('waist', 'Cintura', waist, 'cm', 1, sex),
      indicator('whtr', 'Razão cintura/estatura', waist / heightCm, '', 2, sex),
      indicator('conicity', 'Índice de conicidade', (waist / 100) / (0.109 * Math.sqrt(weightKg / h)), '', 2, sex,
        'Distribuição da gordura, sobretudo abdominal.'),
    );
  }
  if (hip) indicators.push(indicator('hip', 'Quadril', hip, 'cm', 1, sex));
  if (waist && hip) indicators.push(indicator('whr', 'Razão cintura/quadril', waist / hip, '', 2, sex));

  const scored = indicators.filter((i) => SCORED.includes(i.key) && i.band);
  const score = scored.length >= 3
    ? Math.round((scored.reduce((sum, i) => sum + (i.band!.tone === 'good' ? 1 : i.band!.tone === 'warn' ? 0.5 : 0), 0) / scored.length) * 100)
    : null;

  return {
    bodyFatPct: bodyFatPct != null ? round(bodyFatPct, 1) : null,
    fatSource,
    fatMassKg: fatMassKg != null ? round(fatMassKg, 1) : null,
    leanMassKg: leanMassKg != null ? round(leanMassKg, 1) : null,
    // Constante hídrica de mamíferos: 72,3% da massa magra.
    waterL: leanMassKg != null ? round(leanMassKg * 0.723, 1) : null,
    // Cunningham (1980): 500 + 22 × massa magra.
    restingKcal: leanMassKg != null ? round(500 + 22 * leanMassKg, 0) : null,
    bmi: round(bmi, 1),
    indicators,
    score,
  };
}

export const PERIMETERS = [
  { key: 'arm_cm', label: 'Braço', how: 'Braço relaxado ao lado do corpo, no ponto médio entre o ombro e o cotovelo.' },
  { key: 'forearm_cm', label: 'Antebraço', how: 'Na parte mais larga do antebraço, logo abaixo do cotovelo.' },
  { key: 'waist_cm', label: 'Cintura', how: 'No meio entre a última costela e o osso do quadril, no fim de uma expiração normal.' },
  { key: 'hip_cm', label: 'Quadril', how: 'Na parte mais saliente do bumbum, com os pés juntos.' },
  { key: 'thigh_cm', label: 'Coxa', how: 'No meio da coxa, entre a virilha e o joelho, em pé.' },
  { key: 'calf_cm', label: 'Panturrilha', how: 'Na parte mais larga da panturrilha, em pé.' },
] as const;

export type PerimeterKey = (typeof PERIMETERS)[number]['key'];

export function toInputKey(k: string): keyof BodyInputs {
  return ({
    arm_cm: 'armCm',
    forearm_cm: 'forearmCm',
    waist_cm: 'waistCm',
    hip_cm: 'hipCm',
    thigh_cm: 'thighCm',
    calf_cm: 'calfCm',
  } as Record<string, keyof BodyInputs>)[k];
}

/** Converte uma linha do banco nas entradas do motor. */
export function inputsFromRow(
  row: { height_cm: number | null; weight_kg: number | null; body_fat_pct?: number | null } & Record<string, unknown>,
  sex: 'F' | 'M',
): BodyInputs | null {
  if (!row.height_cm || !row.weight_kg) return null;
  const n = (k: string) => (row[k] == null ? null : Number(row[k]));
  return {
    sex,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    bodyFatPct: row.body_fat_pct == null ? null : Number(row.body_fat_pct),
    armCm: n('arm_cm'),
    forearmCm: n('forearm_cm'),
    waistCm: n('waist_cm'),
    hipCm: n('hip_cm'),
    thighCm: n('thigh_cm'),
    calfCm: n('calf_cm'),
  };
}
