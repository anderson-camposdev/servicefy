import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    
    const isChunkError = 
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Failed to fetch') ||
      error.message?.includes('chunk load failed') ||
      error.name === 'ChunkLoadError';

    if (isChunkError) {
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        sessionStorage.setItem('last_chunk_reload', now.toString());
        window.location.reload();
        return;
      }
    }

    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-2xl w-full shadow-lg">
            <h1 className="text-2xl font-bold text-red-600 mb-4">💥 A tela quebrou (Crash)</h1>
            <p className="mb-4">Ocorreu um erro inesperado no código (React Error Boundary).</p>
            <div className="bg-slate-100 p-4 rounded-lg overflow-auto text-xs font-mono text-left max-h-64 mb-4">
              <div className="text-red-500 font-bold mb-2">{this.state.error?.toString()}</div>
              <div>{this.state.errorInfo?.componentStack}</div>
            </div>
            <button
              className="px-4 py-2 bg-slate-800 text-white rounded-lg font-semibold hover:bg-slate-700"
              onClick={() => window.location.reload()}
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

export default ErrorBoundary;
