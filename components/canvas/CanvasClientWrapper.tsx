'use client';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { DocCanvas } from '@/lib/parser/types';
import { CanvasErrorBoundary } from '@/components/canvas/CanvasErrorBoundary';
import type { WritePolicy } from '@/lib/server/write-guard';
import type { DocumentPresentationSidecar } from '@/lib/canvas/presentation-sidecar';
import { startClientPerformanceObservers } from '@/lib/client/performance-telemetry';

const CanvasViewer = dynamic(() => import('@/components/canvas/CanvasViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-[var(--factory-canvas)]">
      <div className="text-center animate-in fade-in duration-500">
        <div className="relative mx-auto mb-6 h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--factory-border)]" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--factory-slate)]" />
        </div>
        <p className="text-sm font-semibold text-[var(--factory-ink)]">正在构建架构全景</p>
        <p className="mt-2 font-mono text-xs text-[var(--factory-muted)]">解析 Markdown，计算布局，生成建筑视图</p>
      </div>
    </div>
  ),
});

export function CanvasClientWrapper({
  document,
  documentHash,
  presentation,
  writePolicy,
}: {
  document: DocCanvas;
  documentHash: string;
  presentation: DocumentPresentationSidecar;
  writePolicy: WritePolicy;
}) {
  useEffect(() => startClientPerformanceObservers(), []);
  return (
    <CanvasErrorBoundary>
      <CanvasViewer
        document={document}
        documentHash={documentHash}
        presentation={presentation}
        writePolicy={writePolicy}
      />
    </CanvasErrorBoundary>
  );
}
