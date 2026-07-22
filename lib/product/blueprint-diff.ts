import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';

export type BlueprintImpactSurface = 'prd' | 'architecture' | 'evaluation' | 'delivery';

export interface BlueprintRevisionSnapshot {
  revision: number;
  documentHash: string;
  blueprint: ProductBlueprint;
}

export interface BlueprintFieldChange {
  path: string;
  before: unknown;
  after: unknown;
  impact: BlueprintImpactSurface[];
}

export interface BlueprintRevisionComparison {
  schemaVersion: 'doccanvas-blueprint-revision-comparison-v1';
  fromRevision: number;
  toRevision: number;
  fromDocumentHash: string;
  toDocumentHash: string;
  knowledgeBaselineDrift: boolean;
  changes: BlueprintFieldChange[];
  recompileScope: BlueprintImpactSurface[];
  affectedArtifactKeys: string[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  return JSON.stringify(canonicalize(value));
}

function impactFor(path: string): BlueprintImpactSurface[] {
  if (path === 'base_knowledge_revision' || path.startsWith('evidence_matrix')) {
    return ['prd', 'architecture', 'evaluation', 'delivery'];
  }
  if (path.startsWith('product_task') || path.startsWith('commercial_hypotheses')) return ['prd'];
  if (path.startsWith('capability_genes') || path.startsWith('execution')) return ['architecture', 'evaluation', 'delivery'];
  if (path.startsWith('evaluation')) return ['evaluation'];
  if (path.startsWith('operations')) return ['delivery'];
  if (path.startsWith('options') || path.startsWith('decision') || path.startsWith('constraints')) return ['prd', 'architecture'];
  return [];
}

function walk(before: unknown, after: unknown, path: string, changes: BlueprintFieldChange[]): void {
  if (canonical(before) === canonical(after)) return;
  if (
    before && after
    && typeof before === 'object' && typeof after === 'object'
    && !Array.isArray(before) && !Array.isArray(after)
  ) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      walk((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], path ? `${path}.${key}` : key, changes);
    }
    return;
  }
  changes.push({ path, before: structuredClone(before), after: structuredClone(after), impact: impactFor(path) });
}

export function buildBlueprintRevisionComparison(input: {
  from: BlueprintRevisionSnapshot;
  to: BlueprintRevisionSnapshot;
  affectedArtifactKeys?: string[];
}): BlueprintRevisionComparison {
  const changes: BlueprintFieldChange[] = [];
  walk(input.from.blueprint, input.to.blueprint, '', changes);
  const scope = new Set<BlueprintImpactSurface>();
  for (const change of changes) for (const surface of change.impact) scope.add(surface);
  return {
    schemaVersion: 'doccanvas-blueprint-revision-comparison-v1',
    fromRevision: input.from.revision,
    toRevision: input.to.revision,
    fromDocumentHash: input.from.documentHash,
    toDocumentHash: input.to.documentHash,
    knowledgeBaselineDrift: input.from.blueprint.base_knowledge_revision !== input.to.blueprint.base_knowledge_revision,
    changes,
    recompileScope: [...scope].sort(),
    affectedArtifactKeys: [...new Set(input.affectedArtifactKeys ?? [])].sort(),
  };
}
