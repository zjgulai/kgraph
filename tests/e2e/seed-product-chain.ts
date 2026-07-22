import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { createBlueprintCandidate, updateBlueprintCandidate } from '../../lib/server/blueprint-workspace-store';
import { compileBlueprintArtifact } from '../../lib/server/blueprint-artifact-store';
import type { ProductBlueprint } from '../../../scripts/lib/blueprint-contract';

const root = process.argv[2];
if (!root) throw new Error('E2E_ROOT_REQUIRED');
const project = resolve(import.meta.dirname, '../..');
const blueprintStore = join(root, 'data/blueprint-candidates');
const artifactStore = join(root, 'data/blueprint-artifacts');
const approved = parseYaml(readFileSync(join(project, '../product/blueprint-fixtures/valid-approved-blueprint.yaml'), 'utf8')) as ProductBlueprint;
const revisionOne = createBlueprintCandidate({
  storeDir: blueprintStore,
  blueprint: approved,
  actor: 'playwright.fixture',
  mutationId: 'playwright.blueprint.create',
  mutatedAt: '2026-07-22T06:00:00Z',
});
compileBlueprintArtifact({
  storeDir: blueprintStore,
  artifactDir: artifactStore,
  blueprintId: revisionOne.blueprintId,
  compiledAt: '2026-07-22T06:05:00Z',
  baseRevision: revisionOne.revision,
  baseDocumentHash: revisionOne.documentHash,
});
updateBlueprintCandidate({
  storeDir: blueprintStore,
  blueprint: {
    ...revisionOne.blueprint,
    version: 2,
    product_task: { ...revisionOne.blueprint.product_task, goal: `${revisionOne.blueprint.product_task.goal}，并保留可回放 Artifact。` },
  },
  baseRevision: revisionOne.revision,
  baseDocumentHash: revisionOne.documentHash,
  actor: 'playwright.fixture',
  mutationId: 'playwright.blueprint.update',
  mutatedAt: '2026-07-22T06:10:00Z',
});
