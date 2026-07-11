'use client';
import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: string; }

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' };

  static getDerivedStateFromError(e: Error) {
    return { hasError: true, error: e.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[100dvh] bg-zinc-950 flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">画布渲染异常</h2>
            <p className="text-sm text-zinc-400 mb-4 font-mono bg-zinc-900 rounded-lg p-3 text-left overflow-auto max-h-32">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> 重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
