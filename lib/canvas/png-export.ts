export const MAX_PNG_PIXELS = 64_000_000;

const PNG_PIXEL_RATIOS = [2, 1] as const;

export interface PngPaintSurfaceState {
  shellExporting: boolean;
  canvasDisplay: string;
  canvasVisibility: string;
  viewportVisibility: string;
  nodeVisibility: string;
  canvasWidth: number;
  canvasHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  nodeWidth: number;
  nodeHeight: number;
}

export function isPngPaintSurfaceReady(state: PngPaintSurfaceState): boolean {
  const dimensions = [
    state.canvasWidth,
    state.canvasHeight,
    state.viewportWidth,
    state.viewportHeight,
    state.nodeWidth,
    state.nodeHeight,
  ];
  return state.shellExporting
    && state.canvasDisplay !== 'none'
    && state.canvasVisibility === 'visible'
    && state.viewportVisibility === 'visible'
    && state.nodeVisibility === 'visible'
    && dimensions.every(value => Number.isFinite(value) && value > 0);
}

export function selectPngPixelRatio(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const basePixels = width * height;
  if (!Number.isFinite(basePixels)) return null;

  return PNG_PIXEL_RATIOS.find(ratio => basePixels * ratio * ratio <= MAX_PNG_PIXELS) ?? null;
}
