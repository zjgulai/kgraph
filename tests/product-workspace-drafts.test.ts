import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import {
  blueprintDraftStorageKey,
  parseBlueprintDraft,
  parseSolutionDraft,
  serializeBlueprintDraft,
  serializeSolutionDraft,
} from '../lib/product/workspace-drafts';
import type { ProductBlueprint } from '../../scripts/lib/blueprint-contract';

test('Product workspace drafts are versioned, bounded and fail closed', () => {
  const solution = {
    input: {
      blueprintId: 'blueprint.example', taskId: 'task.example', productName: 'Example', goal: 'Goal', problem: 'Problem',
      targetUsers: ['Owner'], notSolving: [], successMetrics: ['Metric'],
      capabilityGene: { dimension: 'knowledge_memory' as const, value: 'trace', riskLevel: 'high' as const },
      primaryOption: { title: 'A', description: 'A', assumptions: [], risks: [], tradeoffs: [] },
      alternativeOption: { title: 'B', description: 'B', assumptions: [], risks: [], tradeoffs: [] },
      hardGateCriterion: 'Evidence',
      commercialHypothesis: { customerJob: 'Job', valueProposition: 'Value', valueUnit: 'Unit', experiment: 'Experiment' },
    },
    evidenceIds: ['knowledge.example'],
  };
  assert.deepEqual(parseSolutionDraft(serializeSolutionDraft(solution)), solution);
  assert.equal(parseSolutionDraft('{"schemaVersion":"unknown"}'), null);

  const blueprint = parseYaml(readFileSync(resolve(import.meta.dirname, '../../product/blueprint-fixtures/valid-approved-blueprint.yaml'), 'utf8')) as ProductBlueprint;
  const draft = { blueprintId: blueprint.blueprint_id, baseRevision: 1, baseDocumentHash: `sha256:${'a'.repeat(64)}`, draft: blueprint };
  assert.deepEqual(parseBlueprintDraft(serializeBlueprintDraft(draft)), draft);
  assert.equal(blueprintDraftStorageKey(blueprint.blueprint_id), `doccanvas:blueprint-draft:v1:${blueprint.blueprint_id}`);
});
