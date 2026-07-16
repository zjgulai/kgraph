import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after, before, test } from 'node:test';
import { buildArchitectureViewModel } from '../lib/canvas/architecture-view-model';
import { mutateDocument, listDocumentRevisions, restoreDocumentRevision } from '../lib/server/document-mutations';
import { documentContentHash } from '../lib/server/presentation-store';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';

let root = '';
let filePath = '';
const priorRoot = process.env.DOCCANVAS_ROOT;

const initialMarkdown = [
  '# Mutation fixture',
  '',
  '## Module Alpha',
  '',
  'Alpha introduction.',
  '',
  '### Node One',
  '',
  'First body.',
  '',
  '#### Node One Child',
  '',
  'Child body.',
  '',
  '### Node Two',
  '',
  'Second body.',
  '',
  '## Module Beta',
  '',
  'Beta introduction.',
  '',
  '### Node Three',
  '',
  'Third body.',
  '',
].join('\n');

before(() => {
  root = mkdtempSync(join(tmpdir(), 'doccanvas-mutations-'));
  filePath = join(root, 'documents', 'Playbook-v2.md');
  mkdirSync(join(root, 'documents'), { recursive: true });
  writeFileSync(filePath, initialMarkdown, 'utf8');
  process.env.DOCCANVAS_ROOT = root;
});

after(() => {
  if (priorRoot === undefined) delete process.env.DOCCANVAS_ROOT;
  else process.env.DOCCANVAS_ROOT = priorRoot;
  rmSync(root, { recursive: true, force: true });
});

function currentGraph() {
  return parseMarkdownToGraph(readFileSync(filePath, 'utf8'), 'playbook-v2', filePath);
}

function moduleAndNode(title: string) {
  const graph = currentGraph();
  const model = buildArchitectureViewModel(graph);
  const node = graph.nodes.find(candidate => candidate.title === title);
  assert.ok(node);
  const moduleId = model.nodeRegionId[node.id];
  assert.ok(moduleId);
  const sectionHash = node.metadata.sectionHash;
  assert.equal(typeof sectionHash, 'string');
  return { graph, model, node, moduleId, sectionHash: sectionHash as string };
}

function descendants(directory: string): { directories: string[]; files: string[] } {
  const directories: string[] = [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      directories.push(path);
      const nested = descendants(path);
      directories.push(...nested.directories);
      files.push(...nested.files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return { directories, files };
}

test('mutation transaction inserts, updates, duplicates, moves and soft-deletes with CAS revisions', async () => {
  const first = moduleAndNode('Node One');
  const baseHash = documentContentHash(readFileSync(filePath, 'utf8'));
  const insertRequest = {
    baseRevision: 0,
    baseDocumentHash: baseHash,
    operation: {
      type: 'insertNode' as const,
      moduleId: first.moduleId,
      afterSectionHash: first.sectionHash,
      title: 'Inserted Node',
      content: 'Inserted body.\n',
      nodeType: 'prompt' as const,
    },
  };
  const inserted = await mutateDocument('playbook-v2', insertRequest);
  assert.equal(inserted.revision, 1);
  assert.ok(inserted.document.nodes.some(node => node.title === 'Inserted Node' && node.type === 'prompt'));
  assert.equal(listDocumentRevisions('playbook-v2').length, 1);

  const replayed = await mutateDocument('playbook-v2', insertRequest);
  assert.equal(replayed.revision, inserted.revision);
  assert.equal(replayed.mutationId, inserted.mutationId);
  assert.equal(replayed.presentation.documentHash, inserted.presentation.documentHash);
  assert.equal(listDocumentRevisions('playbook-v2').length, 1);

  await assert.rejects(() => mutateDocument('playbook-v2', {
    baseRevision: 0,
    baseDocumentHash: baseHash,
    operation: {
      type: 'updateModule',
      moduleId: first.moduleId,
      profile: { summary: 'stale' },
    },
  }), /revision conflict/i);

  const insertedCurrent = moduleAndNode('Inserted Node');
  const updated = await mutateDocument('playbook-v2', {
    baseRevision: inserted.revision,
    baseDocumentHash: inserted.presentation.documentHash,
    operation: {
      type: 'updateNode',
      nodeId: insertedCurrent.node.id,
      sectionHash: insertedCurrent.sectionHash,
      title: 'Inserted Node Renamed',
      content: 'Updated body.',
      nodeType: 'tool',
    },
  });
  assert.equal(updated.revision, 2);
  assert.ok(updated.document.nodes.some(node => (
    node.title === 'Inserted Node Renamed'
    && node.content.includes('Updated body.')
    && node.type === 'tool'
  )));
  assert.ok(updated.document.nodes.some(node => node.title === 'Node Two'));

  const renamed = moduleAndNode('Inserted Node Renamed');
  const duplicated = await mutateDocument('playbook-v2', {
    baseRevision: updated.revision,
    baseDocumentHash: updated.presentation.documentHash,
    operation: {
      type: 'duplicateNode',
      moduleId: renamed.moduleId,
      nodeId: renamed.node.id,
      sectionHash: renamed.sectionHash,
    },
  });
  assert.equal(duplicated.revision, 3);
  assert.ok(duplicated.document.nodes.some(node => node.title === 'Inserted Node Renamed 副本'));

  const copy = moduleAndNode('Inserted Node Renamed 副本');
  const second = moduleAndNode('Node Two');
  const moved = await mutateDocument('playbook-v2', {
    baseRevision: duplicated.revision,
    baseDocumentHash: duplicated.presentation.documentHash,
    operation: {
      type: 'moveNode',
      moduleId: copy.moduleId,
      nodeId: copy.node.id,
      sectionHash: copy.sectionHash,
      afterSectionHash: second.sectionHash,
    },
  });
  assert.equal(moved.revision, 4);
  const movedMarkdown = readFileSync(filePath, 'utf8');
  assert.ok(movedMarkdown.indexOf('### Node Two') < movedMarkdown.indexOf('### Inserted Node Renamed 副本'));

  const movedCopy = moduleAndNode('Inserted Node Renamed 副本');
  const deleted = await mutateDocument('playbook-v2', {
    baseRevision: moved.revision,
    baseDocumentHash: moved.presentation.documentHash,
    operation: {
      type: 'softDeleteNode',
      moduleId: movedCopy.moduleId,
      nodeId: movedCopy.node.id,
      sectionHash: movedCopy.sectionHash,
    },
  });
  assert.equal(deleted.revision, 5);
  assert.equal(deleted.document.nodes.some(node => node.title === 'Inserted Node Renamed 副本'), false);
  assert.match(readFileSync(filePath, 'utf8'), /Inserted Node Renamed 副本/);

  const parent = moduleAndNode('Node One');
  const descendant = moduleAndNode('Node One Child');
  await assert.rejects(() => mutateDocument('playbook-v2', {
    baseRevision: deleted.revision,
    baseDocumentHash: deleted.presentation.documentHash,
    operation: {
      type: 'moveNode',
      moduleId: parent.moduleId,
      nodeId: parent.node.id,
      sectionHash: parent.sectionHash,
      parentSectionHash: descendant.sectionHash,
    },
  }), /own descendant/i);

  const generated = descendants(join(root, 'data'));
  assert.ok(generated.files.length > 0);
  for (const directory of generated.directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o750, directory);
  }
  for (const generatedFile of [filePath, ...generated.files]) {
    assert.equal(statSync(generatedFile).mode & 0o777, 0o640, generatedFile);
  }
});

test('restoring a revision creates a new revision instead of deleting history', async () => {
  const revisions = listDocumentRevisions('playbook-v2');
  assert.ok(revisions.length >= 5);
  const oldest = revisions[revisions.length - 1];
  const currentHash = documentContentHash(readFileSync(filePath, 'utf8'));
  const restored = await restoreDocumentRevision('playbook-v2', oldest.id, 5, currentHash);
  assert.equal(restored.revision, 6);
  assert.equal(restored.document.nodes.some(node => node.title === 'Inserted Node'), false);
  const revisionCount = listDocumentRevisions('playbook-v2').length;
  assert.ok(revisionCount >= 6);

  const replayed = await restoreDocumentRevision('playbook-v2', oldest.id, 5, currentHash);
  assert.equal(replayed.revision, restored.revision);
  assert.equal(replayed.mutationId, restored.mutationId);
  assert.equal(listDocumentRevisions('playbook-v2').length, revisionCount);
});
