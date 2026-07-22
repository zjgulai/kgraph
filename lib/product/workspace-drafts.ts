import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';
import type { SolutionScaffoldInput } from '../solutions/blueprint-scaffold';

export const SOLUTION_DRAFT_STORAGE_KEY = 'doccanvas:solution-draft:v1';
const SOLUTION_DRAFT_SCHEMA = 'doccanvas-solution-draft-v1';
const BLUEPRINT_DRAFT_SCHEMA = 'doccanvas-blueprint-draft-v1';
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;

export interface StoredSolutionDraft {
  input: Omit<SolutionScaffoldInput, 'evidenceIds'>;
  evidenceIds: string[];
}

export interface StoredBlueprintDraft {
  blueprintId: string;
  baseRevision: number;
  baseDocumentHash: string;
  draft: ProductBlueprint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProductBlueprintDraft(value: unknown): value is ProductBlueprint {
  if (!isRecord(value) || !isRecord(value.product_task) || !isRecord(value.decision)) return false;
  return typeof value.blueprint_id === 'string'
    && /^blueprint\.[a-zA-Z0-9._-]+$/u.test(value.blueprint_id)
    && Number.isSafeInteger(value.version)
    && value.schema_version === 'ai-product-factory-blueprint-v1.1'
    && typeof value.product_task.task_id === 'string'
    && Array.isArray(value.options)
    && Array.isArray(value.evidence_matrix)
    && Array.isArray(value.human_gates);
}

function isSolutionInput(value: unknown): value is Omit<SolutionScaffoldInput, 'evidenceIds'> {
  if (!isRecord(value) || !isRecord(value.capabilityGene) || !isRecord(value.primaryOption)
    || !isRecord(value.alternativeOption) || !isRecord(value.commercialHypothesis)) return false;
  return typeof value.blueprintId === 'string'
    && typeof value.taskId === 'string'
    && typeof value.productName === 'string'
    && typeof value.goal === 'string'
    && typeof value.problem === 'string'
    && Array.isArray(value.targetUsers)
    && Array.isArray(value.notSolving)
    && Array.isArray(value.successMetrics)
    && typeof value.hardGateCriterion === 'string';
}

function serialize(schemaVersion: string, draft: unknown): string {
  const value = JSON.stringify({ schemaVersion, draft });
  if (new TextEncoder().encode(value).byteLength > MAX_DRAFT_BYTES) throw new Error('PRODUCT_DRAFT_TOO_LARGE');
  return value;
}

export function serializeSolutionDraft(draft: StoredSolutionDraft): string {
  return serialize(SOLUTION_DRAFT_SCHEMA, draft);
}

export function parseSolutionDraft(serialized: string | null): StoredSolutionDraft | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== SOLUTION_DRAFT_SCHEMA || !isRecord(value.draft)) return null;
    const draft = value.draft;
    if (!isRecord(draft.input) || !Array.isArray(draft.evidenceIds)) return null;
    if (!isSolutionInput(draft.input) || !draft.evidenceIds.every(id => typeof id === 'string')) return null;
    return { input: structuredClone(draft.input), evidenceIds: [...draft.evidenceIds] };
  } catch {
    return null;
  }
}

export function blueprintDraftStorageKey(blueprintId: string): string {
  return `doccanvas:blueprint-draft:v1:${blueprintId}`;
}

export function serializeBlueprintDraft(draft: StoredBlueprintDraft): string {
  return serialize(BLUEPRINT_DRAFT_SCHEMA, draft);
}

export function parseBlueprintDraft(serialized: string | null): StoredBlueprintDraft | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== BLUEPRINT_DRAFT_SCHEMA || !isRecord(value.draft)) return null;
    const draft = value.draft;
    if (
      typeof draft.blueprintId !== 'string'
      || !Number.isSafeInteger(draft.baseRevision)
      || typeof draft.baseDocumentHash !== 'string'
      || !isProductBlueprintDraft(draft.draft)
    ) return null;
    return {
      blueprintId: draft.blueprintId,
      baseRevision: draft.baseRevision,
      baseDocumentHash: draft.baseDocumentHash,
      draft: structuredClone(draft.draft),
    } as StoredBlueprintDraft;
  } catch {
    return null;
  }
}
