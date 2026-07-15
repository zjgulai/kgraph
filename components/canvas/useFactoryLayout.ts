'use client';

import { useEffect, useRef, useState } from 'react';
import type { ArchitectureViewModel } from '@/lib/canvas/architecture-view-model';
import {
  computeArchitectureLayout,
  type ArchitectureLayoutResult,
  type ArchitectureLayoutView,
} from '@/lib/canvas/layout-engine';
import type {
  FactoryLayoutWorkerRequest,
  FactoryLayoutWorkerResponse,
} from '@/lib/canvas/factory-layout.worker';

function emptyLayout(view: ArchitectureLayoutView): ArchitectureLayoutResult {
  return {
    view: view.kind === 'overview' ? 'overview' : 'focused-region',
    ...(view.kind === 'focused-region' ? { regionId: view.regionId } : {}),
    nodes: [],
    edges: [],
    bounds: { x: 0, y: 0, width: 1, height: 1 },
  };
}

export function useFactoryLayout(
  model: ArchitectureViewModel,
  view: ArchitectureLayoutView,
  profile: 'desktop' | 'tablet',
): ArchitectureLayoutResult {
  const [layout, setLayout] = useState<ArchitectureLayoutResult>(() => emptyLayout(view));
  const requestIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    let worker: Worker | null = null;
    let fallbackTimer: number | null = null;
    const requestId = ++requestIdRef.current;
    const options = { view, profile } as const;

    const runFallback = (reason: string) => {
      if (!active || fallbackTimer !== null) return;
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = null;
        if (!active || requestId !== requestIdRef.current) return;
        try {
          setLayout(computeArchitectureLayout(model, options));
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : reason;
          throw new Error(`Factory layout failed in worker and fallback: ${message}`);
        }
      }, 0);
    };

    try {
      worker = new Worker(
        new URL('../../lib/canvas/factory-layout.worker.ts', import.meta.url),
        { type: 'module', name: 'doccanvas-factory-layout' },
      );
      worker.onmessage = (event: MessageEvent<FactoryLayoutWorkerResponse>) => {
        if (!active || event.data.requestId !== requestId || requestId !== requestIdRef.current) return;
        if (!event.data.ok) {
          runFallback(event.data.error);
          return;
        }
        setLayout(event.data.layout);
      };
      worker.onerror = event => {
        event.preventDefault();
        runFallback(event.message || 'Factory layout worker could not start.');
      };
      const request: FactoryLayoutWorkerRequest = { requestId, model, options };
      worker.postMessage(request);
    } catch (cause) {
      runFallback(cause instanceof Error ? cause.message : 'Factory layout worker could not start.');
    }

    return () => {
      active = false;
      worker?.terminate();
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    };
  }, [model, profile, view]);

  return layout;
}
