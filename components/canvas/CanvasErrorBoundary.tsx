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
        <div className="flex h-[100dvh] w-full items-center justify-center bg-[#F8FBF0]">
          <div className="mx-5 max-w-md rounded-xl border border-[#D5DFD0] bg-white px-6 py-8 text-center shadow-[0_12px_32px_rgba(24,32,25,0.08)]">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-[#9A5B12]" />
            <h2 className="mb-2 text-lg font-semibold text-[#182019]">画布渲染异常</h2>
            <p className="mb-5 max-h-32 overflow-auto rounded-md border border-[#E4EAE0] bg-[#F8FBF2] p-3 text-left font-mono text-sm text-[#526053]">{this.state.error}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#4F5F9B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#414F82]"
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
