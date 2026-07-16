export function semanticTitleLines(title: string): [string, string?] {
  const normalized = title.replace(/\s+/gu, ' ').trim();
  const delimiter = normalized.match(/^(.{4,40}?)(?:\s*[—–｜|：:]\s*)(.{3,48})$/u);
  if (delimiter) return [delimiter[1], delimiter[2]];
  const productSuffix = normalized.match(/^(.{6,32}?)(Playbook(?:[-\s]?v?[\d.]+)?|VibeTrack(?:[-\s]?v?[\d.]+)?|v\d+(?:\.\d+)+(?:\s+Pro)?)$/iu);
  if (productSuffix) return [productSuffix[1].trim(), productSuffix[2].trim()];
  return [normalized];
}
