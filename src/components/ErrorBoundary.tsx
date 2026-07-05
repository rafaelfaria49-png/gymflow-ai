'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /* Quando muda (ex.: activeView), um erro capturado é limpo automaticamente —
     navegar para outra tela recupera o app sem exigir reload. */
  resetKey?: string;
  /* Se fornecido, exibe o botão "Voltar ao painel" que limpa o erro e navega. */
  onGoHome?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Mantém o erro visível no console em qualquer ambiente para não atrapalhar debug.
    console.error('[GymFlow ErrorBoundary]', error, errorInfo.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    this.props.onGoHome?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="glass border border-white/10 rounded-3xl p-8 max-w-md w-full space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-gym-rose/15 border border-gym-rose/20 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-gym-rose" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-white tracking-tight">Algo deu errado</h2>
            <p className="text-xs text-gym-text-muted leading-relaxed">
              Encontramos um erro inesperado nesta tela. Seus dados de treino continuam salvos no aparelho.
            </p>
          </div>

          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="text-left text-[10px] text-gym-rose bg-gym-dark/60 border border-gym-rose/20 rounded-xl p-3 overflow-x-auto max-h-32 whitespace-pre-wrap break-words">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[44px] px-4 bg-gym-accent hover:bg-gym-accent-hover active:scale-[0.98] text-gym-dark font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-gym-accent/15 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar app
            </button>
            {this.props.onGoHome && (
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex-1 min-h-[44px] px-4 bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <LayoutDashboard className="w-4 h-4 text-gym-accent" />
                Voltar ao painel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
