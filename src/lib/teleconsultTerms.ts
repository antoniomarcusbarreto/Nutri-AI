/**
 * Termo de consentimento da transcrição da teleconsulta (migration 0044).
 *
 * ⚠️ REVISÃO JURÍDICA PENDENTE — rascunho técnico, ainda não validado por
 * advogado. Pontos a confirmar: base legal (LGPD art. 11, I e II "f"),
 * prazo de guarda do prontuário (resolução CFN), retenção e uso para treino
 * no Daily/Deepgram/Google, transferência internacional (art. 33),
 * acompanhante e paciente menor de idade (responsável legal).
 *
 * Ao mudar o texto, suba a versão: o aceite fica gravado com ela.
 */
export const TELECONSULT_TERMS_VERSION = 'tele-2026-10-v1';

export const TELECONSULT_TERMS_TITLE = 'Transcrição desta consulta';

export const TELECONSULT_TERMS_INTRO =
  'Com a sua autorização, a conversa desta consulta online é convertida em texto em tempo real, e uma inteligência artificial organiza um resumo (queixas, hábitos, condutas e metas) para o seu prontuário.';

export const TELECONSULT_TERMS_ITEMS: { title: string; text: string }[] = [
  {
    title: 'O que é guardado',
    text: 'Apenas o texto da conversa e o resumo, depois de revisados pelo seu nutricionista. Não gravamos áudio nem vídeo.',
  },
  {
    title: 'Quem vê',
    text: 'Somente o(a) nutricionista responsável por esta consulta e, se ele(a) decidir compartilhar para o seu atendimento, outro(a) nutricionista da mesma clínica. A secretaria não tem acesso.',
  },
  {
    title: 'Para que serve',
    text: 'Registrar o seu atendimento e apoiar a continuidade do seu acompanhamento nutricional.',
  },
  {
    title: 'Quem processa',
    text: 'A videochamada e a transcrição são processadas pela Daily.co e pela Deepgram, e o resumo pelo Google (Gemini). Esses serviços podem processar os dados fora do Brasil, com salvaguardas contratuais, e não ficam com cópia da transcrição.',
  },
  {
    title: 'Por quanto tempo',
    text: 'Pelo prazo de guarda do prontuário exigido pelas normas profissionais, ou até você pedir a exclusão, quando permitido.',
  },
  {
    title: 'Seus direitos',
    text: 'Você pode recusar sem nenhum prejuízo: a consulta acontece normalmente, sem transcrição. Pode parar a transcrição a qualquer momento pelo botão "Parar transcrição" e pedir acesso, correção ou exclusão dos dados ao seu nutricionista. Se houver um acompanhante na chamada, você declara que ele também está ciente.',
  },
];
