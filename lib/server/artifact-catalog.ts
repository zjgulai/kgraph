import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { validateGenome, type ValidatedGenome } from '../../../scripts/validate-genome';
import { compileProductViews, type CompiledProductViews } from '../product/compiled-views';
import {
  blueprintArtifactKey,
  blueprintArtifactPath,
  type BlueprintArtifactManifest,
} from './blueprint-artifact-store';

const BLUEPRINT_ID_PATTERN = /^blueprint\.[a-zA-Z0-9._-]+$/u;
const ARTIFACT_KEY_PATTERN = /^r\d{6}-\d{8}T\d{6}(?:Z|[+-]\d{4})$/u;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_GENOME_BYTES = 2 * 1024 * 1024;

const ValidationIssueSchema = z.object({
  section: z.string(),
  field: z.string(),
  message: z.string(),
  severity: z.enum(['ERROR', 'WARNING']),
}).strict();

const ManifestSchema = z.object({
  schemaVersion: z.literal('doccanvas-blueprint-artifact-v1'),
  blueprintId: z.string().regex(BLUEPRINT_ID_PATTERN),
  blueprintRevision: z.number().int().positive(),
  blueprintDocumentHash: z.string().regex(HASH_PATTERN),
  compiledAt: z.string().datetime({ offset: true }),
  genomeFile: z.literal('product-genome.yaml'),
  genomeHash: z.string().regex(HASH_PATTERN),
  validation: z.object({
    errors: z.array(ValidationIssueSchema),
    warnings: z.array(ValidationIssueSchema),
  }).strict(),
  input: z.object({
    inputHash: z.string().regex(HASH_PATTERN),
    productTaskId: z.string().regex(/^task\.[a-zA-Z0-9._-]+$/u),
    baseKnowledgeRevision: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)),
    compilerVersion: z.literal('blueprint-compiler-v1.1'),
    sourceMap: z.object({
      productTask: z.literal('product_task'),
      evidence: z.literal('evidence_matrix'),
      execution: z.literal('execution.genome'),
    }).strict(),
  }).strict().optional(),
  replay: z.object({
    status: z.literal('replayable'),
    requiredInputs: z.tuple([
      z.literal('blueprintRevision'),
      z.literal('blueprintDocumentHash'),
      z.literal('compiledAt'),
    ]),
  }).strict().optional(),
  productionStatus: z.literal('unchanged'),
}).strict();

export class ArtifactCatalogError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ArtifactCatalogError';
  }
}

export interface BlueprintArtifactRecord {
  artifactKey: string;
  manifest: BlueprintArtifactManifest;
  genome: ValidatedGenome;
  views: CompiledProductViews;
  genomePath: string;
  manifestPath: string;
}

function fail(code: string, message: string): never {
  throw new ArtifactCatalogError(code, message);
}

function assertDirectory(path: string, code: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code, path);
}

function readBoundedFile(path: string, maxBytes: number, code: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail(code, path);
  if (stat.size > maxBytes) fail(`${code}_TOO_LARGE`, `${path}: ${stat.size}`);
  return readFileSync(path, 'utf8');
}

function parseManifest(raw: string, path: string): BlueprintArtifactManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail('ARTIFACT_MANIFEST_JSON_INVALID', `${path}: ${error instanceof Error ? error.message : 'invalid JSON'}`);
  }
  const parsed = ManifestSchema.safeParse(value);
  if (!parsed.success) fail('ARTIFACT_MANIFEST_INVALID', `${path}: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
  return parsed.data;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function loadArtifact(blueprintId: string, artifactKey: string, target: string): BlueprintArtifactRecord {
  assertDirectory(target, 'ARTIFACT_DIRECTORY_INVALID');
  const entries = readdirSync(target, { withFileTypes: true });
  const names = entries.map(entry => entry.name).sort();
  if (entries.some(entry => entry.isSymbolicLink()) || names.join(',') !== 'manifest.json,product-genome.yaml') {
    fail('ARTIFACT_FILE_SET_INVALID', `${target}: ${names.join(',')}`);
  }
  const manifestPath = join(target, 'manifest.json');
  const genomePath = join(target, 'product-genome.yaml');
  const manifest = parseManifest(readBoundedFile(manifestPath, MAX_MANIFEST_BYTES, 'ARTIFACT_MANIFEST_FILE_INVALID'), manifestPath);
  if (manifest.blueprintId !== blueprintId) fail('ARTIFACT_BLUEPRINT_ID_MISMATCH', target);
  if (blueprintArtifactKey(manifest.blueprintRevision, manifest.compiledAt) !== artifactKey) {
    fail('ARTIFACT_KEY_MISMATCH', target);
  }
  const genomeYaml = readBoundedFile(genomePath, MAX_GENOME_BYTES, 'ARTIFACT_GENOME_FILE_INVALID');
  if (sha256(genomeYaml) !== manifest.genomeHash) fail('ARTIFACT_GENOME_HASH_MISMATCH', genomePath);
  let value: unknown;
  try {
    value = parseYaml(genomeYaml);
  } catch (error) {
    fail('ARTIFACT_GENOME_YAML_INVALID', `${genomePath}: ${error instanceof Error ? error.message : 'invalid YAML'}`);
  }
  const validation = validateGenome(value);
  if (!validation.success || !validation.genome) {
    fail('ARTIFACT_GENOME_INVALID', validation.errors.map(issue => `${issue.section}.${issue.field}`).join(', '));
  }
  const provenance = validation.genome.genome;
  if (
    provenance.blueprint_ref?.document_id !== manifest.blueprintId
    || provenance.blueprint_ref.revision !== manifest.blueprintRevision
    || provenance.blueprint_ref.content_hash !== manifest.blueprintDocumentHash
    || provenance.compiled_at !== manifest.compiledAt
  ) {
    fail('ARTIFACT_PROVENANCE_MISMATCH', target);
  }
  return {
    artifactKey,
    manifest,
    genome: validation.genome,
    views: compileProductViews(validation.genome, manifest),
    genomePath,
    manifestPath,
  };
}

export function listBlueprintArtifacts(options: { artifactDir?: string } = {}): BlueprintArtifactRecord[] {
  const artifactDir = options.artifactDir ?? blueprintArtifactPath();
  if (!existsSync(artifactDir)) return [];
  assertDirectory(artifactDir, 'ARTIFACT_ROOT_INVALID');
  const records: BlueprintArtifactRecord[] = [];
  for (const blueprintEntry of readdirSync(artifactDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    if (blueprintEntry.isSymbolicLink() || !blueprintEntry.isDirectory() || !BLUEPRINT_ID_PATTERN.test(blueprintEntry.name)) {
      fail('ARTIFACT_BLUEPRINT_DIRECTORY_INVALID', blueprintEntry.name);
    }
    const blueprintRoot = join(artifactDir, blueprintEntry.name);
    assertDirectory(blueprintRoot, 'ARTIFACT_BLUEPRINT_DIRECTORY_INVALID');
    for (const artifactEntry of readdirSync(blueprintRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (artifactEntry.isSymbolicLink() || !artifactEntry.isDirectory() || !ARTIFACT_KEY_PATTERN.test(artifactEntry.name)) {
        fail('ARTIFACT_DIRECTORY_INVALID', `${blueprintEntry.name}/${artifactEntry.name}`);
      }
      records.push(loadArtifact(blueprintEntry.name, artifactEntry.name, join(blueprintRoot, artifactEntry.name)));
    }
  }
  return records.sort((left, right) => {
    const byTime = right.manifest.compiledAt.localeCompare(left.manifest.compiledAt);
    return byTime || left.manifest.blueprintId.localeCompare(right.manifest.blueprintId);
  });
}
