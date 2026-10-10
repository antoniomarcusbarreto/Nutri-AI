import { supabase } from './supabase';
import { GeminiError, toGeminiError } from './gemini';
import type { CopilotTurn } from './copilot';

/**
 * Cliente da Edge Function `patient-copilot` (assistente do Portal do
 * Paciente, migration 0037). Mesmo contrato do co-piloto da equipe: a conversa
 * vive só no navegador e vai inteira a cada pergunta.
 */
export async function askPatientCopilot(messages: CopilotTurn[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('patient-copilot', { body: { messages } });
  if (error) throw await toGeminiError(error);
  const text: string | undefined = data?.text;
  if (!text) throw new GeminiError('upstream');
  return text;
}
