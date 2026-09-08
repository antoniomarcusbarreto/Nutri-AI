import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Error Boundary no root da árvore (nota técnica global do usuário).
 *
 * Sem isto, qualquer crash de renderização — JSON corrompido em cache, estado
 * inconsistente, `.map` sobre `undefined` — derruba a árvore inteira para uma
 * tela branca sem saída, e a única recuperação vira "limpar os dados do
 * navegador". Aqui: mensagem clara + "Tentar novamente" que descarta só o
 * estado local suspeito do app (chaves `nutri-ai:*`) — nunca a sessão do
 * Supabase — e recarrega.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Erro de renderização capturado pelo ErrorBoundary:', error, info.componentStack);
  }

  private handleRetry = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('nutri-ai:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* localStorage indisponível (aba privada, cookies bloqueados) — ignora e recarrega mesmo assim */
    }
    window.location.assign('/');
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-200 p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Algo saiu do lugar</h1>
          <p className="mt-2 text-sm text-slate-500">
            A tela encontrou um erro inesperado e não conseguiu carregar. Seus dados no servidor estão a salvo.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#5024fc] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#431cdb]"
          >
            Tentar novamente
          </button>
          <p className="mt-4 text-xs text-slate-400">
            Se o problema continuar, entre em contato com o suporte.
          </p>
        </div>
      </div>
    );
  }
}
