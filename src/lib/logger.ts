/**
 * Logger central da aplicação (Onda 6 / DEBT-08 + SEC-16).
 *
 * - Em desenvolvimento: escreve no console.
 * - Em produção: o `esbuild.drop: ['console']` do vite.config remove TODAS as
 *   chamadas de console do bundle, então estes métodos viram no-op — nada de
 *   detalhe de erro do Supabase/Gemini vazando no console do navegador.
 *
 * É o único ponto a alterar para plugar um coletor externo (Sentry, etc.).
 */

const isDev = import.meta.env.DEV;

type Args = unknown[];

export const logger = {
  error: (...args: Args) => {
    if (isDev) console.error(...args);
    // prod: enviar para o coletor de erros aqui, se houver.
  },
  warn: (...args: Args) => {
    if (isDev) console.warn(...args);
  },
  info: (...args: Args) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: Args) => {
    if (isDev) console.debug(...args);
  },
};
