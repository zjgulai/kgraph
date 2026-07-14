'use client';
import dynamic from 'next/dynamic';
import { ReactFlowProvider } from '@xyflow/react';
import type { DocCanvas } from '@/lib/parser/types';
import { CanvasErrorBoundary } from '@/components/canvas/CanvasErrorBoundary';
import type { WritePolicy } from '@/lib/server/write-guard';

const CanvasViewer = dynamic(() => import('@/components/canvas/CanvasViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[#F8FBF0]">
      <div className="text-center animate-in fade-in duration-500">
        <div className="relative mx-auto mb-6 h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-[#D5DFD0]" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#4F5F9B]" />
        </div>
        <p className="text-sm font-semibold text-[#3C493D]">正在构建架构全景</p>
        <p className="mt-2 font-mono text-xs text-[#637064]">解析 Markdown，计算布局，生成建筑视图</p>
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
