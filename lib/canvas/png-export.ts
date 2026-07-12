export const MAX_PNG_PIXELS = 64_000_000;

const PNG_PIXEL_RATIOS = [2, 1] as const;

export function selectPngPixelRatio(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const basePixels = width * height;
  if (!Number.isFinite(basePixels)) return null;

  return PNG_PIXEL_RATIOS.find(ratio => basePixels * ratio * ratio <= MAX_PNG_PIXELS) ?? null;
}
