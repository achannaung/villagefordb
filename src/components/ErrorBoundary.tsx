import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Unique per village — opening another village clears a previous error */
  resetKey?: string | number;
  /** Called when the user dismisses the fallback (e.g. close the panel) */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render/load crashes (e.g. a code-split chunk failing on a flaky
 * network) so the whole app doesn't go blank. Shows a recoverable panel.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Recovered UI crash:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
          <div className="relative w-full max-w-lg h-full glass-panel border-l border-slate-800 shadow-2xl flex flex-col items-center justify-center gap-4 p-8 text-center z-10">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-2xl font-bold">
              !
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-display">Couldn't open details</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                The details view failed to load (usually a network hiccup). Your search results are safe.
              </p>
            </div>
            <button
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 px-6 rounded-xl transition cursor-pointer"
            >
              Back to results
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
