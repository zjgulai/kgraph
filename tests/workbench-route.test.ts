import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_WORKBENCH_ROUTE,
  parseWorkbenchRoute,
  toCanvasObject,
  toKnowledgeObject,
  toReviewObject,
  toArtifact,
  toProductTask,
  withKnowledgeObject,
  workbenchHref,
  withWorkbenchView,
} from '../lib/workbench/routes';

test('workbench route defaults to the Operations work queue and rejects unknown views', () => {
  assert.deepEqual(parseWorkbenchRoute(new URLSearchParams()), DEFAULT_WORKBENCH_ROUTE);
  assert.deepEqual(
    parseWorkbenchRoute(new URLSearchParams('area=knowledge&view=unknown&object=hidden')),
    DEFAULT_WORKBENCH_ROUTE,
  );
});

test('workbench route canonicalizes the area and round-trips shareable knowledge state', () => {
  const route = parseWorkbenchRoute(new URLSearchParams([
    ['area', 'operations'],
    ['view', 'knowledge'],
    ['object', 'knowledge.mcp_servers.context7'],
    ['revision', '7'],
    ['q', 'context'],
    ['domain', 'ai-product.tooling.mcp'],
    ['form', 'fact'],
    ['evidence', 'human_reviewed'],
    ['maturity', 'structured'],
    ['lifecycle', 'active'],
  ]));

  assert.equal(route.area, 'knowledge');
  assert.equal(route.view, 'knowledge');
  assert.equal(route.objectId, 'knowledge.mcp_servers.context7');
  assert.equal(route.revision, 7);
  assert.deepEqual(route.filters, {
    query: 'context',
    domain: 'ai-product.tooling.mcp',
    knowledgeForm: 'fact',
    evidenceGrade: 'human_reviewed',
    assetMaturity: 'structured',
    lifecycle: 'active',
  });
  assert.deepEqual(route.libraryView, {
    sort: 'relevance',
    density: 'comfortable',
    layout: 'list',
  });
  assert.equal(
    workbenchHref(route),
    '/?area=knowledge&view=knowledge&object=knowledge.mcp_servers.context7&revision=7&q=context&domain=ai-product.tooling.mcp&form=fact&evidence=human_reviewed&maturity=structured&lifecycle=active&sort=relevance&density=comfortable&layout=list',
  );
});

test('knowledge handoff routes preserve capture lineage and switch to the requested destination', () => {
  const capture = parseWorkbenchRoute(new URLSearchParams(
    'view=capture&capture=capture-0123456789abcdef01234567&object=knowledge.capture.example',
  ));

  assert.equal(capture.captureId, 'capture-0123456789abcdef01234567');
  assert.match(workbenchHref(capture), /capture=capture-0123456789abcdef01234567/u);
  assert.equal(toKnowledgeObject(capture, 'knowledge.capture.example').view, 'knowledge');
  assert.equal(toReviewObject(capture, 'knowledge.capture.example').view, 'review');
  assert.equal(toCanvasObject(capture, 'knowledge.capture.example').view, 'canvas');
  assert.equal(toReviewObject(capture, 'knowledge.capture.example').captureId, capture.captureId);
  assert.equal(toKnowledgeObject(capture, 'knowledge.other').captureId, capture.captureId, 'explicit handoff keeps lineage');
  assert.equal(withKnowledgeObject(capture, 'knowledge.other').captureId, null, 'ordinary object selection clears stale lineage');
});

test('switching workspace view clears incompatible object state but keeps compatible filters', () => {
  const knowledge = parseWorkbenchRoute(new URLSearchParams('view=knowledge&object=ko-1&q=router'));
  const review = withWorkbenchView(knowledge, 'review');
  const blueprint = withWorkbenchView(review, 'blueprints');

  assert.equal(review.area, 'knowledge');
  assert.equal(review.objectId, 'ko-1');
  assert.equal(review.filters.query, 'router');
  assert.equal(blueprint.area, 'product');
  assert.equal(blueprint.objectId, null);
  assert.deepEqual(blueprint.filters, DEFAULT_WORKBENCH_ROUTE.filters);
});

test('product chain route round-trips Task, Blueprint, Artifact and compiled view state', () => {
  const task = toProductTask(DEFAULT_WORKBENCH_ROUTE, 'task.audit-copilot', 'blueprint.audit-copilot');
  const artifact = toArtifact(task, 'blueprint.audit-copilot', 'r000002-20260722T061000Z', 'evaluation');
  const parsed = parseWorkbenchRoute(new URLSearchParams(workbenchHref(artifact).slice(2)));

  assert.equal(parsed.taskId, 'task.audit-copilot');
  assert.equal(parsed.blueprintId, 'blueprint.audit-copilot');
  assert.equal(parsed.artifactKey, 'r000002-20260722T061000Z');
  assert.equal(parsed.tab, 'evaluation');
  assert.equal(parsed.view, 'artifacts');
});

test('operations route round-trips Evidence Registry identity and Timeline axis', () => {
  const evidence = parseWorkbenchRoute(new URLSearchParams('area=operations&view=evidence&record=evidence%3Aknowledge%3Aexample'));
  assert.equal(evidence.view, 'evidence');
  assert.equal(evidence.evidenceId, 'evidence:knowledge:example');
  assert.match(workbenchHref(evidence), /view=evidence.*record=evidence%3Aknowledge%3Aexample/u);

  const timeline = parseWorkbenchRoute(new URLSearchParams('area=operations&view=timeline&tab=governance'));
  assert.equal(timeline.tab, 'governance');
  assert.match(workbenchHref(timeline), /view=timeline.*tab=governance/u);
});
