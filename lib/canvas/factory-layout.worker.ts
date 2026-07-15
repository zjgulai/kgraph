/// <reference lib="webworker" />

import type { ArchitectureViewModel } from './architecture-view-model';
import {
  computeArchitectureLayout,
  type ArchitectureLayoutOptions,
  type ArchitectureLayoutResult,
} from './layout-engine';

export interface FactoryLayoutWorkerRequest {
  requestId: number;
  model: ArchitectureViewModel;
  options: ArchitectureLayoutOptions;
}

export type FactoryLayoutWorkerResponse =
  | { requestId: number; ok: true; layout: ArchitectureLayoutResult }
  | { requestId: number; ok: false; error: string };

self.addEventListener('message', (event: MessageEvent<FactoryLayoutWorkerRequest>) => {
  const { requestId, model, options } = event.data;
  try {
    const response: FactoryLayoutWorkerResponse = {
      requestId,
      ok: true,
      layout: computeArchitectureLayout(model, options),
    };
    self.postMessage(response);
  } catch (cause) {
    const response: FactoryLayoutWorkerResponse = {
      requestId,
      ok: false,
      error: cause instanceof Error ? cause.message : 'Factory layout worker failed.',
    };
    self.postMessage(response);
  }
});

export {};
