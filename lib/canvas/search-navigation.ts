import type { ArchitectureRegionKind } from './architecture-view-model';

export interface SearchNavigationTarget {
  query: string;
  nodeId: string;
  regionId?: string;
  displayTitle: string;
  sourceLabel: string;
}
export interface SearchNavigationIndex {
  nodeIds: ReadonlySet<string>;
  nodeRegionId: Readonly<Record<string, string>>;
  regionKindById: Readonly<Record<string, ArchitectureRegionKind>>;
}

export type SearchNavigationResolution =
  | { kind: 'focused-node'; nodeId: string; regionId: string }
  | { kind: 'standalone-node'; nodeId: string }
  | { kind: 'stale'; reason: 'node-missing' | 'region-changed' | 'region-missing' };

export function resolveSearchNavigationTarget(
  target: SearchNavigationTarget,
  index: SearchNavigationIndex,
): SearchNavigationResolution {
  if (!index.nodeIds.has(target.nodeId)) {
    return { kind: 'stale', reason: 'node-missing' };
  }

  const currentRegionId = index.nodeRegionId[target.nodeId];
  if (currentRegionId !== target.regionId) {
    return { kind: 'stale', reason: 'region-changed' };
  }
  if (!currentRegionId) {
    return { kind: 'standalone-node', nodeId: target.nodeId };
  }

  const regionKind = index.regionKindById[currentRegionId];
  if (!regionKind) {
    return { kind: 'stale', reason: 'region-missing' };
  }
  if (regionKind === 'roof') {
    return { kind: 'standalone-node', nodeId: target.nodeId };
  }
  return { kind: 'focused-node', nodeId: target.nodeId, regionId: currentRegionId };
}
