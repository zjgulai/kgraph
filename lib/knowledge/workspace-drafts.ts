import type { KnowledgeReviewPatch } from '../server/knowledge-review-store';

export const CAPTURE_DRAFT_STORAGE_KEY = 'doccanvas:capture-draft:v1';
const CAPTURE_DRAFT_SCHEMA = 'doccanvas-capture-draft-v1';
const REVIEW_DRAFT_SCHEMA = 'doccanvas-review-draft-v1';
const MAX_CAPTURE_DRAFT_BYTES = 1024 * 1024;

export interface CaptureWorkspaceDraft {
  sourceKind: 'url' | 'file';
  sourceUri: string;
  file: { fileName: string; mediaType: 'text/markdown' | 'text/plain'; content: string } | null;
  content: string;
  title: string;
  domainRef: string;
}

export interface StoredReviewDraft {
  objectId: string;
  baseRevision: number;
  baseObjectHash: string;
  base: KnowledgeReviewPatch;
  local: KnowledgeReviewPatch;
}

export type ReviewConflictChoice = 'current' | 'local';
export type ReviewConflictChoices = Partial<Record<keyof KnowledgeReviewPatch, ReviewConflictChoice>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isCaptureDraft(value: unknown): value is CaptureWorkspaceDraft {
  if (!isRecord(value)) return false;
  const file = value.file;
  return (value.sourceKind === 'url' || value.sourceKind === 'file')
    && typeof value.sourceUri === 'string'
    && typeof value.content === 'string'
    && typeof value.title === 'string'
    && typeof value.domainRef === 'string'
    && (file === null || (isRecord(file)
      && typeof file.fileName === 'string'
      && (file.mediaType === 'text/markdown' || file.mediaType === 'text/plain')
      && typeof file.content === 'string'));
}

export function serializeCaptureDraft(draft: CaptureWorkspaceDraft): string {
  const serialized = JSON.stringify({ schemaVersion: CAPTURE_DRAFT_SCHEMA, draft });
  if (byteLength(serialized) > MAX_CAPTURE_DRAFT_BYTES) throw new Error('CAPTURE_DRAFT_TOO_LARGE');
  return serialized;
}

export function parseCaptureDraft(serialized: string | null): CaptureWorkspaceDraft | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== CAPTURE_DRAFT_SCHEMA || !isCaptureDraft(value.draft)) return null;
    return value.draft;
  } catch {
    return null;
  }
}

export function reviewDraftStorageKey(objectId: string): string {
  return `doccanvas:review-draft:v1:${objectId}`;
}

function isReviewPatch(value: unknown): value is KnowledgeReviewPatch {
  return isRecord(value) && typeof value.title === 'string' && typeof value.body === 'string';
}

export function serializeReviewDraft(draft: StoredReviewDraft): string {
  return JSON.stringify({ schemaVersion: REVIEW_DRAFT_SCHEMA, draft });
}

export function parseReviewDraft(serialized: string | null): StoredReviewDraft | null {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== REVIEW_DRAFT_SCHEMA || !isRecord(value.draft)) return null;
    const draft = value.draft;
    if (
      typeof draft.objectId !== 'string'
      || !Number.isSafeInteger(draft.baseRevision)
      || typeof draft.baseObjectHash !== 'string'
      || !isReviewPatch(draft.base)
      || !isReviewPatch(draft.local)
    ) return null;
    return draft as unknown as StoredReviewDraft;
  } catch {
    return null;
  }
}

export function mergeReviewConflict(
  current: KnowledgeReviewPatch,
  local: KnowledgeReviewPatch,
  choices: ReviewConflictChoices,
): KnowledgeReviewPatch {
  const merged = structuredClone(local);
  for (const key of Object.keys(choices) as Array<keyof KnowledgeReviewPatch>) {
    if (choices[key] === 'current') {
      Object.assign(merged, { [key]: structuredClone(current[key]) });
    }
  }
  return merged;
}
