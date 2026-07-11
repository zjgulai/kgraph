'use client';
import dynamic from 'next/dynamic';
import { ReactFlowProvider } from '@xyflow/react';
import type { DocCanvas } from '@/lib/parser/types';
import { CanvasErrorBoundary } from '@/components/canvas/CanvasErrorBoundary';
import type { WritePolicy } from '@/lib/server/write-guard';

const CanvasViewer = dynamic(() => import('@/components/canvas/CanvasViewer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[100dvh] bg-[#0a0a0f] flex items-center justify-center">
      <div className="text-center animate-in fade-in duration-500">
        {/* Branded loader ring */}
        <div className="relative w-16 h-16 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-zinc-800" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500 animate-spin" />
          <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDuration: '0.8s', animationDirection: 'reverse' }} />
        </div>
        <p className="text-zinc-500 text-sm font-medium">正在加载画布</p>
        <p className="text-zinc-700 text-xs mt-2 font-mono">parsing markdown → computing layout → rendering nodes</p>
      </div>
    </div>
  ),
});

export function CanvasClientWrapper({ document, writePolicy }: { document: DocCanvas; writePolicy: WritePolicy }) {
  return (
    <CanvasErrorBoundary>
      <ReactFlowProvider>
        <CanvasViewer document={document} writePolicy={writePolicy} />
      </ReactFlowProvider>
    </CanvasErrorBoundary>
  );
}
