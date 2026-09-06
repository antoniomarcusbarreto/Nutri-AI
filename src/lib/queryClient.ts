import { QueryClient } from '@tanstack/react-query';

/**
 * Cliente único do TanStack Query (Onda 4 / PERF-03).
 *
 * Defaults escolhidos para um SaaS de consultório:
 *  - staleTime 60s: dados considerados frescos por 1 min → navegar entre
 *    módulos (Exames ↔ Consultas ↔ Acompanhamento) do mesmo paciente não
 *    dispara refetch; o dado vem do cache.
 *  - refetchOnWindowFocus false: evita rajada de requisições ao voltar de
 *    outra aba (comum em uso de desktop no consultório).
 *  - retry 1: uma retentativa em erro transitório, sem loop.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
