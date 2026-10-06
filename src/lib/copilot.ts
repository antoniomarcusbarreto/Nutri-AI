import { supabase } from './supabase';
import { GeminiError, toGeminiError } from './gemini';

/**
 * Cliente da Edge Function `copilot`. A conversa vive só no navegador (não é
 * persistida): a cada pergunta o histórico vai inteiro e a função devolve a
 * resposta + os assuntos que consultou.
 */

export interface CopilotTurn {
  role: 'user' | 'model';
  text: string;
}

export interface CopilotReply {
  text: string;
  /** Rótulos do que foi consultado ("agenda", "exames"…). */
  steps: string[];
}

export async function askCopilot(
  messages: CopilotTurn[],
  context: { patientId?: string | null } = {},
): Promise<CopilotReply> {
  const { data, error } = await supabase.functions.invoke('copilot', {
    body: { messages, context: { patientId: context.patientId ?? undefined } },
  });
  if (error) throw await toGeminiError(error);
  const text: string | undefined = data?.text;
  if (!text) throw new GeminiError('upstream');
  return { text, steps: Array.isArray(data?.steps) ? data.steps : [] };
}
