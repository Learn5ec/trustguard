import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches React render errors so the app never shows
 * a blank/black screen. Logs the full stack to the console for debugging.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[TrustGuard] Uncaught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-zinc-900 border border-red-800/40 rounded-xl p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2">Something went wrong</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                TrustGuard encountered an unexpected error. This is usually caused by a
                misconfiguration or a temporary issue.
              </p>
              {this.state.error && (
                <pre className="mt-4 text-left text-xs text-red-400 bg-zinc-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
