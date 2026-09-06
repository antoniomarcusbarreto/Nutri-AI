import { supabase } from './supabase';
import {
  EXAM_ANALYSIS_INSTRUCTION,
  SOAP_STRUCTURE_INSTRUCTION,
  MEAL_PLAN_INSTRUCTION,
} from './geminiPrompts';
import type { MealPlanData } from '../types/mealPlan';

/**
 * Cliente único do gemini-proxy (Onda 5 / DEBT-02 + pendência SEC-10).
 *
 * Antes: 4 chamadas `supabase.functions.invoke('gemini-proxy', ...)` copiadas
 * em Exams/Consultations/MealPlans, cada uma com seu parse de ```json``` e um
 * `throw new Error(data?.error || err?.message || '...')` genérico.
 *
 * Agora: `callGemini()` monta o payload, faz o parse e traduz o status HTTP
 * (que a Edge Function passou a retornar de verdade na Onda 2) num
 * `GeminiError` tipado com mensagem pronta para toast.
 */

export type GeminiErrorKind =
  | 'quota'         // 429 — limite diário
  | 'forbidden'     // 403 — sem permissão de IA (paciente/secretária)
  | 'payload'       // 413 — arquivo grande demais
  | 'unauthorized'  // 401 — sessão expirada
  | 'bad_request'   // 400
  | 'upstream'      // 5xx — Gemini/infra indisponível
  | 'network'       // falha de rede ao chamar a função
  | 'parse'         // resposta não era JSON válido
  | 'unknown';

const MESSAGES: Record<GeminiErrorKind, string> = {
  quota: 'Você atingiu o limite diário de uso da IA. Tente novamente amanhã.',
  forbidden: 'Seu perfil não tem permissão para usar os recursos de IA.',
  payload: 'O arquivo é grande demais para ser analisado pela IA.',
  unauthorized: 'Sua sessão expirou. Entre novamente para usar a IA.',
  bad_request: 'Não foi possível processar a solicitação de IA.',
  upstream: 'O serviço de IA está indisponível no momento. Tente novamente em alguns minutos.',
  network: 'Falha de conexão ao contatar o serviço de IA.',
  parse: 'A IA retornou uma resposta inesperada. Tente novamente.',
  unknown: 'Erro ao processar a solicitação de IA.',
};

export class GeminiError extends Error {
  readonly kind: GeminiErrorKind;
  constructor(kind: GeminiErrorKind, message?: string) {
    super(message ?? MESSAGES[kind]);
    this.name = 'GeminiError';
    this.kind = kind;
  }
}

function kindFromStatus(status: number): GeminiErrorKind {
  switch (status) {
    case 429: return 'quota';
    case 413: return 'payload';
    case 403: return 'forbidden';
    case 401: return 'unauthorized';
    case 400: return 'bad_request';
    default: return status >= 500 ? 'upstream' : 'unknown';
  }
}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

function stripJsonFences(text: string): string {
  return text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
}

/**
 * Chama o gemini-proxy com `responseMimeType: application/json`, valida a
 * resposta e devolve o objeto já parseado. Lança `GeminiError` em qualquer
 * falha (quota, permissão, upstream, parse…).
 */
export async function callGemini<T>(opts: {
  instruction: string;
  parts: GeminiPart[];
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gemini-proxy', {
    body: {
      contents: [{ role: 'user', parts: opts.parts }],
      systemInstruction: { role: 'system', parts: [{ text: opts.instruction }] },
      generationConfig: { responseMimeType: 'application/json' },
    },
  });

  if (error) {
    // supabase-js: FunctionsHttpError (não-2xx) traz .context: Response
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') {
      let serverMsg: string | undefined;
      try { serverMsg = (await ctx.clone().json())?.error; } catch { /* corpo não-JSON */ }
      throw new GeminiError(kindFromStatus(ctx.status), serverMsg);
    }
    // FunctionsFetchError / FunctionsRelayError → sem Response
    throw new GeminiError('network');
  }

  const text: string | null = data?.text ?? null;
  if (!text) throw new GeminiError('upstream');

  try {
    return JSON.parse(stripJsonFences(text)) as T;
  } catch {
    throw new GeminiError('parse');
  }
}

// ---------------------------------------------------------------------------
// Funções de domínio
// ---------------------------------------------------------------------------

export interface ExamBiomarker {
  marcador: string;
  valor: string;
  referencia: string;
  status?: 'alterado' | 'normal';
  gravidade?: 'alta' | 'media';
  nota_clinica?: string;
}

export interface ExamAnalysis {
  alertas: ExamBiomarker[];
  insights: string;
  todos_biomarcadores: ExamBiomarker[];
  analise_preditiva?: string;
  focos_sugeridos?: string[];
  tempo_estimado?: number;
}

/** Analisa um PDF de exame (base64, sem o prefixo data:) e retorna o laudo estruturado. */
export function analyzeExamPdf(base64Pdf: string): Promise<ExamAnalysis> {
  return callGemini<ExamAnalysis>({
    instruction: EXAM_ANALYSIS_INSTRUCTION,
    parts: [
      { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
      { text: 'Analise o exame enviado em PDF e retorne o JSON estrito conforme as instruções.' },
    ],
  });
}

export interface SoapNotes {
  resumo_caso: string;
  queixas_paciente: string[];
  conduta_nutricionista: string[];
  metas_pactuadas: string[];
}

/** Estrutura a transcrição bruta de uma consulta em prontuário S.O.A.P. */
export async function structureConsultationNotes(transcript: string): Promise<SoapNotes> {
  const raw = await callGemini<Partial<SoapNotes>>({
    instruction: SOAP_STRUCTURE_INSTRUCTION,
    parts: [{
      text: `Aqui está a transcrição bruta da consulta para processar:\n\n${transcript}\n\nPor favor, analise a transcrição com cuidado e retorne o JSON estrito conforme as instruções.`,
    }],
  });
  return {
    resumo_caso: raw.resumo_caso ?? '',
    queixas_paciente: raw.queixas_paciente ?? [],
    conduta_nutricionista: raw.conduta_nutricionista ?? [],
    metas_pactuadas: raw.metas_pactuadas ?? [],
  };
}

/** Gera um plano alimentar a partir do prompt de contexto já montado pela tela. */
export function generateMealPlan(contextPrompt: string): Promise<MealPlanData> {
  return callGemini<MealPlanData>({
    instruction: MEAL_PLAN_INSTRUCTION,
    parts: [{ text: `Gere a dieta personalizada baseada neste histórico:\n\n${contextPrompt}` }],
  });
}

/** Converte um Blob (PDF baixado da signed URL) em base64 puro. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
