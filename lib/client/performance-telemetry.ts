export type ClientPerformanceMetric =
  | 'fcp'
  | 'inp'
  | 'surface-switch'
  | 'inspector-open'
  | 'canvas-pan'
  | 'canvas-zoom'
  | 'canvas-drag'
  | 'canvas-reroute';

const metricAttribute: Record<ClientPerformanceMetric, string> = {
  fcp: 'perfFcpMs',
  inp: 'perfInpMs',
  'surface-switch': 'perfSurfaceSwitchMs',
  'inspector-open': 'perfInspectorOpenMs',
  'canvas-pan': 'perfCanvasPanMs',
  'canvas-zoom': 'perfCanvasZoomMs',
  'canvas-drag': 'perfCanvasDragMs',
  'canvas-reroute': 'perfCanvasRerouteMs',
};

function rounded(value: number): string {
  return Math.max(0, value).toFixed(2);
}

export function recordClientPerformance(
  metric: ClientPerformanceMetric,
  durationMs: number,
  target: HTMLElement = document.documentElement,
): void {
  if (!Number.isFinite(durationMs)) return;
  target.dataset[metricAttribute[metric]] = rounded(durationMs);
  performance.measure(`doccanvas:${metric}`, { start: performance.now() - durationMs, end: performance.now() });
}

export function startClientPerformanceObservers(): () => void {
  const observers: PerformanceObserver[] = [];
  const fcp = performance.getEntriesByName('first-contentful-paint').at(-1);
  if (fcp) recordClientPerformance('fcp', fcp.startTime);

  if (PerformanceObserver.supportedEntryTypes.includes('paint')) {
    const paintObserver = new PerformanceObserver(list => {
      const entry = list.getEntriesByName('first-contentful-paint').at(-1);
      if (entry) recordClientPerformance('fcp', entry.startTime);
    });
    paintObserver.observe({ type: 'paint', buffered: true });
    observers.push(paintObserver);
  }

  if (PerformanceObserver.supportedEntryTypes.includes('event')) {
    let longestInteraction = 0;
    const eventObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longestInteraction = Math.max(longestInteraction, entry.duration);
      if (longestInteraction > 0) recordClientPerformance('inp', longestInteraction);
    });
    eventObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    observers.push(eventObserver);
  }

  return () => observers.forEach(observer => observer.disconnect());
}
