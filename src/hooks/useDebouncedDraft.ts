import { useEffect, useRef } from 'react';

/**
 * Auto-save de rascunho em localStorage com debounce (Onda 5 / PERF-10).
 *
 * Antes: Consultations e MealPlans faziam `localStorage.setItem(key,
 * JSON.stringify(...))` SÍNCRONO a cada tecla (o SOAP/plano inteiro).
 *
 * - grava no máx. 1x a cada `delay` ms (default 500);
 * - remove a chave quando `isEmpty` (nada digitado);
 * - `flush()` força a gravação imediata (ex.: no `beforeunload`).
 *
 * Persistência de dados clínicos em texto puro continua sendo alvo do SEC-11 —
 * este hook só centraliza/otimiza o que já existia.
 */
export function useDebouncedDraft<T>(
  key: string | null,
  value: T,
  opts?: { delay?: number; isEmpty?: (v: T) => boolean },
) {
  const delay = opts?.delay ?? 500;
  const isEmpty = opts?.isEmpty;
  const valueRef = useRef(value);
  // Mantém o ref com o valor mais recente sem escrever durante o render
  // (react-hooks/refs). Roda antes do efeito de debounce abaixo.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const flush = () => {
    if (!key) return;
    const v = valueRef.current;
    if (isEmpty?.(v)) {
      localStorage.removeItem(key);
    } else {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* quota/modo privado — ignora */
      }
    }
  };

  useEffect(() => {
    if (!key) return;
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, delay]);

  // Grava o que estiver pendente se a aba for fechada.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { flush };
}
