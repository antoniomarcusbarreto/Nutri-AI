import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';
import { reportToSupport } from '../lib/support';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reportStatus: 'idle' | 'sending' | 'sent' | 'failed';
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
  state: State = { error: null, errorInfo: null, reportStatus: 'idle' };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null, reportStatus: 'idle' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Erro de renderização capturado pelo ErrorBoundary:', error, info.componentStack);
    this.setState({ errorInfo: info });
  }

  private handleReportError = async () => {
    const { error, errorInfo } = this.state;
    if (!error) return;
    this.setState({ reportStatus: 'sending' });

    // Sem contexto de auth aqui (ErrorBoundary fica acima do AuthProvider) —
    // tenta obter a sessão atual só como melhor esforço, pra anexar e-mail/id.
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? null;
    } catch {
      /* segue sem identificar o usuário */
    }

    const enviado = await reportToSupport({
      type: 'erro',
      message: error.message || 'Erro de renderização sem mensagem.',
      userId,
      userEmail,
      extra: {
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
      },
    });

    this.setState({ reportStatus: enviado ? 'sent' : 'failed' });
  };

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

          {this.state.reportStatus === 'sent' ? (
            <p className="mt-4 text-sm font-medium text-emerald-600">Erro reportado. Obrigado!</p>
          ) : (
            <button
              type="button"
              onClick={this.handleReportError}
              disabled={this.state.reportStatus === 'sending'}
              className="mt-4 block w-full text-sm font-semibold text-slate-500 underline decoration-dotted underline-offset-4 transition-colors hover:text-slate-700 disabled:opacity-50"
            >
              {this.state.reportStatus === 'sending' ? 'Enviando...' : 'Reportar este erro'}
            </button>
          )}
          {this.state.reportStatus === 'failed' && (
            <p className="mt-2 text-xs text-rose-500">Não foi possível enviar o relato agora. Tente novamente.</p>
          )}

          <p className="mt-4 text-xs text-slate-400">
            Se o problema continuar, entre em contato com o suporte.
          </p>
        </div>
      </div>
    );
  }
}
