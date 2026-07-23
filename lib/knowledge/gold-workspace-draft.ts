const GOLD_DRAFT_SCHEMA = 'doccanvas-gold-draft-v1';
const MAX_GOLD_DRAFT_BYTES = 32 * 1024;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export interface GoldWorkspaceDraftFields {
  title: string;
  summary: string;
  keyPoints: string;
  objectType: string;
  primary: string;
  subform: string;
  domains: string;
  startLine: number;
  endLine: number;
}

export interface StoredGoldWorkspaceDraft {
  captureId: string;
  sourceHash: string;
  baseRevision: number | null;
  baseAnnotationHash: string | null;
  draft: GoldWorkspaceDraftFields;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

function isFields(value: unknown): value is GoldWorkspaceDraftFields {
  if (!isRecord(value)) return false;
  return isBoundedString(value.title, 160)
    && isBoundedString(value.summary, 1_200)
    && isBoundedString(value.keyPoints, 12_000)
    && isBoundedString(value.objectType, 64)
    && isBoundedString(value.primary, 64)
    && isBoundedString(value.subform, 64)
    && isBoundedString(value.domains, 4_000)
    && Number.isSafeInteger(value.startLine)
    && Number.isSafeInteger(value.endLine)
    && Number(value.startLine) >= 1
    && Number(value.endLine) >= Number(value.startLine);
}

function isStoredDraft(value: unknown): value is StoredGoldWorkspaceDraft {
  if (!isRecord(value) || !isFields(value.draft)) return false;
  return isBoundedString(value.captureId, 256)
    && value.captureId.length > 0
    && isBoundedString(value.sourceHash, 256)
    && value.sourceHash.length > 0
    && (value.baseRevision === null || (Number.isSafeInteger(value.baseRevision) && Number(value.baseRevision) > 0))
    && (value.baseAnnotationHash === null || isBoundedString(value.baseAnnotationHash, 256));
}

export function goldDraftStorageKey(captureId: string): string {
  return `doccanvas:gold-draft:v1:${captureId}`;
}

export function serializeGoldWorkspaceDraft(value: StoredGoldWorkspaceDraft): string {
  if (!isStoredDraft(value)) throw new Error('Gold workspace draft is invalid.');
  const serialized = JSON.stringify({ schemaVersion: GOLD_DRAFT_SCHEMA, draft: value });
  if (byteLength(serialized) > MAX_GOLD_DRAFT_BYTES) {
    throw new Error('Gold workspace draft is too large.');
  }
  return serialized;
}

export function parseGoldWorkspaceDraft(serialized: string | null): StoredGoldWorkspaceDraft | null {
  if (!serialized || byteLength(serialized) > MAX_GOLD_DRAFT_BYTES) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== GOLD_DRAFT_SCHEMA || !isStoredDraft(value.draft)) return null;
    return structuredClone(value.draft);
  } catch {
    return null;
  }
}
