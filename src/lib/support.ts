import { logger } from './logger';

/**
 * Ponte com o fluxo n8n de suporte (mesmo padrão usado no DoseCerta-AI):
 * o app manda a dúvida/problema/erro direto pro webhook, sem Edge Function no
 * meio. Lá, uma IA consulta uma base de conhecimento e decide entre responder
 * o usuário por e-mail ou escalar para o desenvolvedor — nada disso vive aqui.
 */
export type SupportRequestType = 'duvida' | 'problema' | 'erro';

interface ReportToSupportInput {
  type: SupportRequestType;
  message: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  extra?: Record<string, unknown>;
}

export async function reportToSupport(input: ReportToSupportInput): Promise<boolean> {
  const endpoint = import.meta.env.VITE_N8N_SUPPORT_WEBHOOK_URL as string | undefined;
  if (!endpoint) {
    logger.error('[support] VITE_N8N_SUPPORT_WEBHOOK_URL não configurada — mensagem não enviada.');
    return false;
  }

  try {
    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appSource: 'Nutri-AI',
        type: input.type,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        userEmail: input.userEmail ?? null,
        message: input.message,
        metadata: {
          currentRoute: window.location.pathname,
          userAgent: navigator.userAgent,
          appVersion: import.meta.env.VITE_APP_VERSION ?? null,
          timestamp: new Date().toISOString(),
          ...input.extra,
        },
      }),
    });
    return resposta.ok;
  } catch (err) {
    logger.error('[support] falha ao enviar para o webhook do n8n:', err);
    return false;
  }
}
