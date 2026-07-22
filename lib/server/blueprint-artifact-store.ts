import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { stringify as stringifyYaml } from 'yaml';
import {
  BlueprintValidationError,
  compileBlueprint,
} from '../../../scripts/lib/blueprint-contract';
import {
  validateGenome,
  type ValidationError,
} from '../../../scripts/validate-genome';
import { projectPath } from './project-root';
import {
  BlueprintWorkspaceError,
  loadBlueprintCandidate,
} from './blueprint-workspace-store';

const DATE_TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

export interface BlueprintArtifactManifest {
  schemaVersion: 'doccanvas-blueprint-artifact-v1';
  blueprintId: string;
  blueprintRevision: number;
  blueprintDocumentHash: string;
  compiledAt: string;
  genomeFile: string;
  genomeHash: string;
  validation: {
    errors: ValidationError[];
    warnings: ValidationError[];
  };
  input?: {
    inputHash: string;
    productTaskId: string;
    baseKnowledgeRevision: string;
    evidenceIds: string[];
    compilerVersion: 'blueprint-compiler-v1.1';
    sourceMap: {
      productTask: 'product_task';
      evidence: 'evidence_matrix';
      execution: 'execution.genome';
    };
  };
  replay?: {
    status: 'replayable';
    requiredInputs: ['blueprintRevision', 'blueprintDocumentHash', 'compiledAt'];
  };
  productionStatus: 'unchanged';
}

export interface BlueprintCompilePreview {
  schemaVersion: 'doccanvas-blueprint-compile-preview-v1';
  blueprintId: string;
  blueprintRevision: number;
  inputHash: string;
  productTaskId: string;
  baseKnowledgeRevision: string;
  evidenceIds: string[];
  compilerVersion: 'blueprint-compiler-v1.1';
  compiledAt: string;
  artifactKey: string;
  genomeHash: string;
  outputs: ['manifest.json', 'product-genome.yaml'];
  validation: BlueprintArtifactManifest['validation'];
  productionStatus: 'unchanged';
}

export interface CompiledBlueprintArtifact {
  manifest: BlueprintArtifactManifest;
  genomeYaml: string;
  genomePath: string;
  manifestPath: string;
}

function fail(code: string, message: string, status = 400): never {
  throw new BlueprintWorkspaceError(code, message, status);
}

export function blueprintArtifactPath(): string {
  const configured = process.env.DOCCANVAS_BLUEPRINT_ARTIFACT_PATH?.trim();
  if (configured) {
    if (!isAbsolute(configured)) fail('BLUEPRINT_ARTIFACT_PATH_INVALID', '配置路径必须是绝对路径', 500);
    return resolve(configured);
  }
  return projectPath('data/blueprint-artifacts');
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o750 });
}

export function blueprintArtifactKey(revision: number, compiledAt: string): string {
  const timestamp = compiledAt.replace(/[-:]/gu, '').replace(/\.\d+/u, '');
  return `r${String(revision).padStart(6, '0')}-${timestamp}`;
}

export function compileBlueprintArtifact(options: {
  storeDir?: string;
  artifactDir?: string;
  blueprintId: string;
  compiledAt: string;
  baseRevision?: number;
  baseDocumentHash?: string;
}): CompiledBlueprintArtifact {
  if (!DATE_TIME_WITH_OFFSET.test(options.compiledAt) || Number.isNaN(Date.parse(options.compiledAt))) {
    fail('COMPILED_AT_INVALID', 'compiledAt 必须是带时区的 ISO 8601 date-time');
  }
  const current = loadBlueprintCandidate({ storeDir: options.storeDir, blueprintId: options.blueprintId });
  const hasExpectedRevision = options.baseRevision !== undefined || options.baseDocumentHash !== undefined;
  if (hasExpectedRevision && (
    options.baseRevision === undefined
    || options.baseDocumentHash === undefined
    || current.revision !== options.baseRevision
    || current.documentHash !== options.baseDocumentHash
  )) {
    fail('BLUEPRINT_COMPILE_INPUT_DRIFT', `current=${current.revision}/${current.documentHash}`, 409);
  }
  let compiled: ReturnType<typeof compileBlueprint>;
  try {
    compiled = compileBlueprint(current.blueprint, { compiledAt: options.compiledAt });
  } catch (error) {
    if (error instanceof BlueprintValidationError) {
      const first = error.errors[0];
      fail(first?.code ?? 'BLUEPRINT_NOT_COMPILE_READY', error.message, 409);
    }
    throw error;
  }

  const validation = validateGenome(compiled.genome);
  if (!validation.success) {
    fail(
      'COMPILED_GENOME_INVALID',
      validation.errors.map(item => `${item.section}.${item.field}: ${item.message}`).join('; '),
      500,
    );
  }

  const artifactDir = options.artifactDir ?? blueprintArtifactPath();
  const blueprintRoot = join(artifactDir, current.blueprintId);
  const target = join(blueprintRoot, blueprintArtifactKey(current.revision, options.compiledAt));
  if (existsSync(target)) fail('BLUEPRINT_ARTIFACT_EXISTS', target, 409);
  ensureDirectory(blueprintRoot);
  try {
    mkdirSync(target, { mode: 0o750 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') fail('BLUEPRINT_ARTIFACT_EXISTS', target, 409);
    throw error;
  }

  const genomeFile = 'product-genome.yaml';
  const genomeYaml = stringifyYaml(compiled.genome, { lineWidth: 0 });
  const genomeHash = `sha256:${createHash('sha256').update(genomeYaml, 'utf8').digest('hex')}`;
  const manifest: BlueprintArtifactManifest = {
    schemaVersion: 'doccanvas-blueprint-artifact-v1',
    blueprintId: current.blueprintId,
    blueprintRevision: current.revision,
    blueprintDocumentHash: current.documentHash,
    compiledAt: options.compiledAt,
    genomeFile,
    genomeHash,
    validation: { errors: validation.errors, warnings: validation.warnings },
    input: {
      inputHash: current.documentHash,
      productTaskId: current.blueprint.product_task.task_id,
      baseKnowledgeRevision: current.blueprint.base_knowledge_revision,
      evidenceIds: [...new Set(current.blueprint.evidence_matrix.flatMap(item => item.evidence_ids))].sort(),
      compilerVersion: 'blueprint-compiler-v1.1',
      sourceMap: {
        productTask: 'product_task',
        evidence: 'evidence_matrix',
        execution: 'execution.genome',
      },
    },
    replay: {
      status: 'replayable',
      requiredInputs: ['blueprintRevision', 'blueprintDocumentHash', 'compiledAt'],
    },
    productionStatus: 'unchanged',
  };
  const genomePath = join(target, genomeFile);
  const manifestPath = join(target, 'manifest.json');
  writeFileSync(genomePath, genomeYaml, { encoding: 'utf8', flag: 'wx', flush: true, mode: 0o640 });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', flush: true, mode: 0o640 });
  return { manifest, genomeYaml, genomePath, manifestPath };
}

export function previewBlueprintArtifact(options: {
  storeDir?: string;
  artifactDir?: string;
  blueprintId: string;
  compiledAt: string;
  baseRevision: number;
  baseDocumentHash: string;
}): BlueprintCompilePreview {
  if (!DATE_TIME_WITH_OFFSET.test(options.compiledAt) || Number.isNaN(Date.parse(options.compiledAt))) {
    fail('COMPILED_AT_INVALID', 'compiledAt 必须是带时区的 ISO 8601 date-time');
  }
  const current = loadBlueprintCandidate({ storeDir: options.storeDir, blueprintId: options.blueprintId });
  if (current.revision !== options.baseRevision || current.documentHash !== options.baseDocumentHash) {
    fail('BLUEPRINT_COMPILE_INPUT_DRIFT', `current=${current.revision}/${current.documentHash}`, 409);
  }
  let compiled: ReturnType<typeof compileBlueprint>;
  try {
    compiled = compileBlueprint(current.blueprint, { compiledAt: options.compiledAt });
  } catch (error) {
    if (error instanceof BlueprintValidationError) {
      const first = error.errors[0];
      fail(first?.code ?? 'BLUEPRINT_NOT_COMPILE_READY', error.message, 409);
    }
    throw error;
  }
  const validation = validateGenome(compiled.genome);
  if (!validation.success) {
    fail('COMPILED_GENOME_INVALID', validation.errors.map(item => `${item.section}.${item.field}: ${item.message}`).join('; '), 500);
  }
  const genomeYaml = stringifyYaml(compiled.genome, { lineWidth: 0 });
  return {
    schemaVersion: 'doccanvas-blueprint-compile-preview-v1',
    blueprintId: current.blueprintId,
    blueprintRevision: current.revision,
    inputHash: current.documentHash,
    productTaskId: current.blueprint.product_task.task_id,
    baseKnowledgeRevision: current.blueprint.base_knowledge_revision,
    evidenceIds: [...new Set(current.blueprint.evidence_matrix.flatMap(item => item.evidence_ids))].sort(),
    compilerVersion: 'blueprint-compiler-v1.1',
    compiledAt: options.compiledAt,
    artifactKey: blueprintArtifactKey(current.revision, options.compiledAt),
    genomeHash: `sha256:${createHash('sha256').update(genomeYaml, 'utf8').digest('hex')}`,
    outputs: ['manifest.json', 'product-genome.yaml'],
    validation: { errors: validation.errors, warnings: validation.warnings },
    productionStatus: 'unchanged',
  };
}
