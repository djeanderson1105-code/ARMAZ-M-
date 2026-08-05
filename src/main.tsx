import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initImageCacheFromIDB } from './utils/indexedDbCache.ts';
import { initAppStorageFromIDB } from './utils/apiSync.ts';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  declare props: ErrorBoundaryProps;
  state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h1 className="text-xl font-bold text-white">Ocorreu um erro na aplicação</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Ocorreu uma falha inesperada durante o processamento da interface. Você pode tentar recarregar a página para restaurar o sistema.
            </p>
            {this.state.error && (
              <div className="bg-slate-950/80 p-3 rounded-lg text-left overflow-x-auto text-xs font-mono text-red-300 border border-slate-800 max-h-32">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-colors cursor-pointer text-sm"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

let mounted = false;

function mountApp() {
  if (mounted) return;
  mounted = true;

  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}

// Timeout fallback: mount after 1000ms if IDB initialization takes too long
const fallbackTimer = setTimeout(() => {
  console.warn("[Init] IDB initialization took over 1s, proceeding with app render fallback.");
  mountApp();
}, 1000);

Promise.all([initImageCacheFromIDB(), initAppStorageFromIDB()])
  .then(() => {
    clearTimeout(fallbackTimer);
    mountApp();
  })
  .catch((err) => {
    console.error("[Init] IDB init error:", err);
    clearTimeout(fallbackTimer);
    mountApp();
  });

