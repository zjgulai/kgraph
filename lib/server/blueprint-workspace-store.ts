import { existsSync, lstatSync, readdirSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import {
  validateBlueprint,
  type ContractError,
  type ProductBlueprint,
} from '../../../scripts/lib/blueprint-contract';
import {
  BlueprintStoreError,
  createBlueprintRevision,
  listBlueprintRevisions,
  readCurrentBlueprint,
  updateBlueprintRevision,
} from '../../../scripts/lib/blueprint-store';
import { projectPath } from './project-root';

const BLUEPRINT_ID_PATTERN = /^blueprint\.[a-zA-Z0-9._-]+$/u;

export interface BlueprintCandidateRecord {
  blueprint: ProductBlueprint;
  blueprintId: string;
  revision: number;
  documentHash: string;
  validationErrors: ContractError[];
  revisions: number[];
}

export interface BlueprintCandidateSummary {
  blueprintId: string;
  productName: string;
  status: ProductBlueprint['status'];
  revision: number;
  documentHash: string;
  baseKnowledgeRevision: string;
  compileReady: boolean;
  validationErrors: ContractError[];
}

interface MutationMetadata {
  actor: string;
  mutationId: string;
  mutatedAt: string;
}

export class BlueprintWorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(`${code}: ${message}`);
    this.name = 'BlueprintWorkspaceError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new BlueprintWorkspaceError(code, message, status);
}

function statusForStoreCode(code: string): number {
  if (code === 'BLUEPRINT_NOT_FOUND' || code === 'BLUEPRINT_REVISION_NOT_FOUND') return 404;
  if (code === 'BLUEPRINT_CAS_CONFLICT' || code === 'BLUEPRINT_ALREADY_EXISTS' || code === 'BLUEPRINT_STORE_LOCKED') return 409;
  if (code.includes('INTEGRITY') || code.includes('TRANSACTION_INCOMPLETE')) return 500;
  return 400;
}

function translateStoreError(error: unknown): never {
  if (error instanceof BlueprintStoreError) {
    fail(error.code, error.message.replace(`${error.code}: `, ''), statusForStoreCode(error.code));
  }
  throw error;
}

function validatedBlueprint(value: unknown): ProductBlueprint {
  const validation = validateBlueprint(value);
  if (!validation.success || !validation.blueprint) {
    fail('BLUEPRINT_INVALID', validation.errors.map(item => `${item.code} ${item.path}: ${item.message}`).join('; '));
  }
  return validation.blueprint;
}

export function blueprintStorePath(): string {
  const configured = process.env.DOCCANVAS_BLUEPRINT_STORE_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('BLUEPRINT_STORE_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return projectPath('data/blueprint-candidates');
}

function record(storeDir: string, blueprintId: string): BlueprintCandidateRecord {
  try {
    const current = readCurrentBlueprint(storeDir, blueprintId);
    const validation = validateBlueprint(current.blueprint);
    return {
      blueprint: current.blueprint,
      blueprintId,
      revision: current.pointer.revision,
      documentHash: current.pointer.document_hash,
      validationErrors: validation.errors,
      revisions: listBlueprintRevisions(storeDir, blueprintId).sort((left, right) => right - left),
    };
  } catch (error) {
    translateStoreError(error);
  }
}

function blueprintIds(storeDir: string): string[] {
  if (!existsSync(storeDir)) return [];
  if (lstatSync(storeDir).isSymbolicLink()) fail('BLUEPRINT_STORE_SYMLINK_REJECTED', storeDir, 500);
  const root = join(storeDir, 'blueprints');
  if (!existsSync(root)) return [];
  if (lstatSync(root).isSymbolicLink()) fail('BLUEPRINT_STORE_SYMLINK_REJECTED', root, 500);
  const ids: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !BLUEPRINT_ID_PATTERN.test(entry.name)) {
      fail('BLUEPRINT_STORE_DIRECTORY_INVALID', entry.name, 500);
    }
    ids.push(entry.name);
  }
  return ids.sort();
}

export function listBlueprintCandidates(options: { storeDir?: string } = {}): BlueprintCandidateSummary[] {
  const storeDir = options.storeDir ?? blueprintStorePath();
  return blueprintIds(storeDir).map(blueprintId => {
    const current = record(storeDir, blueprintId);
    return {
      blueprintId,
      productName: current.blueprint.product_task.product_name,
      status: current.blueprint.status,
      revision: current.revision,
      documentHash: current.documentHash,
      baseKnowledgeRevision: current.blueprint.base_knowledge_revision,
      compileReady: current.blueprint.status === 'approved'
        && Boolean(current.blueprint.execution)
        && current.validationErrors.length === 0,
      validationErrors: current.validationErrors,
    };
  });
}

export function loadBlueprintCandidate(options: {
  storeDir?: string;
  blueprintId: string;
}): BlueprintCandidateRecord {
  const storeDir = options.storeDir ?? blueprintStorePath();
  if (!BLUEPRINT_ID_PATTERN.test(options.blueprintId)) fail('BLUEPRINT_ID_INVALID', options.blueprintId);
  return record(storeDir, options.blueprintId);
}

export function createBlueprintCandidate(options: {
  storeDir?: string;
  blueprint: unknown;
} & MutationMetadata): BlueprintCandidateRecord {
  const storeDir = options.storeDir ?? blueprintStorePath();
  const blueprint = validatedBlueprint(options.blueprint);
  try {
    const created = createBlueprintRevision({
      storeDir,
      blueprint,
      actor: options.actor,
      mutationId: options.mutationId,
      mutatedAt: options.mutatedAt,
    });
    return {
      blueprint: created.blueprint,
      blueprintId: created.blueprint.blueprint_id,
      revision: created.pointer.revision,
      documentHash: created.pointer.document_hash,
      validationErrors: [],
      revisions: [created.pointer.revision],
    };
  } catch (error) {
    translateStoreError(error);
  }
}

export function updateBlueprintCandidate(options: {
  storeDir?: string;
  blueprint: unknown;
  baseRevision: number;
  baseDocumentHash: string;
} & MutationMetadata): BlueprintCandidateRecord {
  const storeDir = options.storeDir ?? blueprintStorePath();
  const blueprint = validatedBlueprint(options.blueprint);
  try {
    updateBlueprintRevision({
      storeDir,
      blueprint,
      baseRevision: options.baseRevision,
      baseDocumentHash: options.baseDocumentHash,
      actor: options.actor,
      mutationId: options.mutationId,
      mutatedAt: options.mutatedAt,
    });
    return record(storeDir, blueprint.blueprint_id);
  } catch (error) {
    translateStoreError(error);
  }
}
