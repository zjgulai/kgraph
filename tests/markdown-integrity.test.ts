import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractMarkdownSections, sectionHash } from '../lib/markdown/sections';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';
import { syncSection } from '../lib/sync/precise-sync';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('keeps the exact markdown body as editable node content', () => {
  const markdown = '# Doc\n\n## Rich\n\n**bold** and [link](https://example.com).\n\n1. first\n\n> quote\n\n<div>html</div>\n\n---\n\n## Next\n\nbody\n';
  const graph = parseMarkdownToGraph(markdown, 'fixture', '/fixture.md');
  const rich = graph.nodes.find(node => node.title === 'Rich');
  assert.equal(rich?.content, '\n**bold** and [link](https://example.com).\n\n1. first\n\n> quote\n\n<div>html</div>\n\n---\n\n');
});

test('does not index fenced code comments as headings', () => {
  const sections = extractMarkdownSections('## Genome\n\n```yaml\n# product-genome.yaml\nname: demo\n```\n\n## Next\n');
  assert.deepEqual(sections.map(section => section.heading), ['Genome', 'Next']);
});

test('excludes front matter while retaining duplicate headings', () => {
  const markdown = '---\r\ntitle: Demo\r\n---\r\n\r\n## Repeat\r\n\r\nfirst\r\n## Repeat\r\n\r\nsecond';
  const sections = extractMarkdownSections(markdown);
  assert.deepEqual(sections.map(section => section.heading), ['Repeat', 'Repeat']);
});

test('does not index heading-like comments inside standard front matter', () => {
  const markdown = [
    '---',
    'title: Demo',
    '# comment inside front matter',
    'nested:',
    '  # nested comment',
    '  enabled: true',
    '---',
    '',
    '# Document',
    '',
    '## Section',
    '',
    'body',
  ].join('\n');

  const sections = extractMarkdownSections(markdown);
  assert.deepEqual(sections.map(section => section.heading), ['Document', 'Section']);
  assert.equal(sections[0]?.startOffset, markdown.indexOf('# Document'));
});

test('preserves CRLF bodies at the reported offsets', () => {
  const markdown = '## First\r\n\r\nbody\r\n## Next\r\n';
  const sections = extractMarkdownSections(markdown);
  assert.equal(sections[0]?.body, '\r\nbody\r\n');
  assert.equal(
    markdown.slice(sections[0]?.bodyStartOffset, sections[0]?.endOffset),
    sections[0]?.body,
  );
});

test('normalizes line endings in hashes without trimming body bytes', () => {
  assert.equal(sectionHash('Title', '\r\nbody\r\n'), sectionHash('Title', '\nbody\n'));
  assert.notEqual(sectionHash('Title', '\nbody\n'), sectionHash('Title', '\nbody\n\n'));
});

test('preserves CRLF body bytes while keeping LF and CRLF section hashes equal', () => {
  const crlfMarkdown = '## Section\r\n\r\nbody\r\nline\r\n';
  const lfMarkdown = crlfMarkdown.replaceAll('\r\n', '\n');
  const [crlfSection] = extractMarkdownSections(crlfMarkdown);
  const [lfSection] = extractMarkdownSections(lfMarkdown);

  assert.ok(crlfSection);
  assert.ok(lfSection);
  assert.equal(crlfSection.body, '\r\nbody\r\nline\r\n');
  assert.equal(
    crlfMarkdown.slice(crlfSection.bodyStartOffset, crlfSection.endOffset),
    crlfSection.body,
  );
  assert.equal(crlfSection.hash, lfSection.hash);
  assert.equal(sectionHash(crlfSection.heading, crlfSection.body), lfSection.hash);
});

test('handles a heading at EOF and a final body without a trailing newline', () => {
  const headingAtEof = '## First\nbody\n## EOF';
  const eofSections = extractMarkdownSections(headingAtEof);
  assert.equal(eofSections[0]?.body, 'body\n');
  assert.equal(eofSections[0]?.endOffset, headingAtEof.indexOf('## EOF'));
  assert.equal(eofSections[1]?.body, '');
  assert.equal(eofSections[1]?.bodyStartOffset, headingAtEof.length);
  assert.equal(eofSections[1]?.endOffset, headingAtEof.length);

  const bodyWithoutTrailingNewline = '## Final\nbody without trailing newline';
  const [finalSection] = extractMarkdownSections(bodyWithoutTrailingNewline);
  assert.ok(finalSection);
  assert.equal(finalSection.body, 'body without trailing newline');
  assert.equal(finalSection.endOffset, bodyWithoutTrailingNewline.length);
  assert.equal(
    bodyWithoutTrailingNewline.slice(finalSection.bodyStartOffset, finalSection.endOffset),
    finalSection.body,
  );
});

test('updates the intended section without treating a fenced comment as a boundary', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-markdown-edit-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '# Doc\n\n## Genome\n\n```yaml\n# product-genome.yaml\nname: demo\n```\n\n## Next\n\nbody\n';
  writeFileSync(fixturePath, before, 'utf-8');
  const graph = parseMarkdownToGraph(before, 'fixture', fixturePath);
  const genome = graph.nodes.find(node => node.title === 'Genome');
  assert.ok(genome);

  const newContent = genome.content.replace('name: demo', 'name: updated');
  const result = await syncSection(fixturePath, {
    hash: genome.metadata.sectionHash as string,
    originalHeading: genome.title,
    newHeading: genome.title,
    newContent,
  });

  assert.equal(result.success, true, result.message);
  assert.equal(
    readFileSync(fixturePath, 'utf-8'),
    before.replace('name: demo', 'name: updated'),
  );
});

test('changes only the targeted offset range during a CRLF replacement', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-targeted-edit-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = [
    '---',
    'title: Fixture',
    '---',
    '',
    '# Document',
    '',
    '## Before',
    '',
    'before body',
    '',
    '## Target',
    '',
    'old body',
    '',
    '## After',
    '',
    'after body',
    '',
  ].join('\r\n');
  writeFileSync(fixturePath, before, 'utf-8');

  const target = extractMarkdownSections(before).find(section => section.heading === 'Target');
  assert.ok(target);
  const prefix = before.slice(0, target.startOffset);
  const suffix = before.slice(target.endOffset);
  const newContent = '\r\nupdated body\r\nsecond line\r\n\r\n';

  const result = await syncSection(fixturePath, {
    hash: target.hash,
    originalHeading: target.heading,
    newHeading: target.heading,
    newContent,
  });

  const after = readFileSync(fixturePath, 'utf-8');
  const expectedReplacement = `## Target\r\n${newContent}`;
  assert.equal(result.success, true, result.message);
  assert.equal(result.operation, 'replace');
  assert.equal(after, prefix + expectedReplacement + suffix);
  assert.equal(after.slice(0, target.startOffset), prefix);
  assert.equal(after.slice(after.length - suffix.length), suffix);
  assert.equal(after.replaceAll('\r\n', '').includes('\n'), false);
});

test('preserves the raw formatted heading during a body-only edit', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-formatted-heading-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '# Doc\n\n## Use `tsx` safely\n\nold body\n\n## Next\n\nbody\n';
  writeFileSync(fixturePath, before, 'utf-8');
  const target = extractMarkdownSections(before).find(section => section.heading === 'Use tsx safely');
  assert.ok(target);

  const result = await syncSection(fixturePath, {
    hash: target.hash,
    originalHeading: target.heading,
    newHeading: target.heading,
    newContent: target.body.replace('old body', 'updated body'),
  });

  assert.equal(result.success, true, result.message);
  assert.equal(
    readFileSync(fixturePath, 'utf-8'),
    before.replace('old body', 'updated body'),
  );
});

test('returns the actual re-parsed section hash after a formatted title edit', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-formatted-title-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '# Doc\n\n## Plain title\n\nbody\n\n## Next\n\nnext body\n';
  writeFileSync(fixturePath, before, 'utf-8');
  const target = extractMarkdownSections(before).find(section => section.heading === 'Plain title');
  assert.ok(target);

  const result = await syncSection(fixturePath, {
    hash: target.hash,
    originalHeading: target.heading,
    newHeading: '`Renamed` title',
    newContent: target.body,
  });

  const updated = readFileSync(fixturePath, 'utf-8');
  const savedSection = extractMarkdownSections(updated).find(section => section.heading === 'Renamed title');
  assert.equal(result.success, true, result.message);
  assert.ok(savedSection);
  assert.equal(result.hash, savedSection.hash);
});

test('rejects a stale hash instead of overwriting a concurrent edit', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-stale-hash-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const staleHash = sectionHash('Section', '\nold\n');
  const concurrent = '## Section\n\nconcurrent\n';
  writeFileSync(fixturePath, concurrent, 'utf-8');

  const result = await syncSection(fixturePath, {
    hash: staleHash,
    originalHeading: 'Section',
    newHeading: 'Section',
    newContent: '\nclient\n',
  });

  assert.deepEqual(
    { operation: result.operation, saved: readFileSync(fixturePath, 'utf-8') },
    { operation: 'conflict', saved: concurrent },
  );
});

test('rejects an empty hash instead of falling back to a unique heading', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-empty-hash-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '## Unique\n\nserver\n';
  writeFileSync(fixturePath, before, 'utf-8');

  const result = await syncSection(fixturePath, {
    hash: '',
    originalHeading: 'Unique',
    newHeading: 'Unique',
    newContent: '\nclient\n',
  });

  assert.equal(result.success, false);
  assert.equal(result.operation, 'conflict');
  assert.equal(readFileSync(fixturePath, 'utf-8'), before);
});

test('rejects duplicate headings when no hash identifies one section', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-duplicate-heading-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '## Repeat\n\nfirst\n## Repeat\n\nsecond\n';
  writeFileSync(fixturePath, before, 'utf-8');

  const result = await syncSection(fixturePath, {
    originalHeading: '  Repeat  ',
    newHeading: 'Repeat',
    newContent: '\nclient\n',
  });

  assert.equal(result.success, false);
  assert.equal(result.operation, 'conflict');
  assert.equal(readFileSync(fixturePath, 'utf-8'), before);
});

test('rejects duplicate identical hash and content instead of choosing a section', async (t) => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-duplicate-hash-'));
  const fixturePath = join(fixtureDir, 'fixture.md');
  t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

  const before = '## Repeat\n\nsame\n## Repeat\n\nsame\n';
  writeFileSync(fixturePath, before, 'utf-8');
  const sections = extractMarkdownSections(before);
  assert.equal(sections.length, 2);
  assert.equal(sections[0]?.hash, sections[1]?.hash);

  const result = await syncSection(fixturePath, {
    hash: sections[0]?.hash,
    originalHeading: 'Repeat',
    newHeading: 'Repeat',
    newContent: '\nclient\n',
  });

  assert.equal(result.success, false);
  assert.equal(result.operation, 'conflict');
  assert.equal(readFileSync(fixturePath, 'utf-8'), before);
});

const PLAYBOOKS = [
  { id: 'vibe-track', fileName: 'VibeTrack.md' },
  { id: 'v2-pro', fileName: 'v2.7-Pro.md' },
  { id: 'playbook-v2', fileName: 'Playbook-v2.md' },
] as const;

for (const playbook of PLAYBOOKS) {
  test(`keeps ${playbook.id} byte-for-byte equal after a representative no-op sync`, async (t) => {
    const sourcePath = resolve(PROJECT_ROOT, 'documents', playbook.fileName);
    const fixtureDir = mkdtempSync(join(tmpdir(), 'doccanvas-markdown-'));
    const fixturePath = join(fixtureDir, basename(sourcePath));
    t.after(() => rmSync(fixtureDir, { recursive: true, force: true }));

    copyFileSync(sourcePath, fixturePath);
    const before = readFileSync(fixturePath, 'utf-8');
    const graph = parseMarkdownToGraph(before, playbook.id, fixturePath);
    const titleCounts = new Map<string, number>();
    for (const node of graph.nodes) {
      titleCounts.set(node.title, (titleCounts.get(node.title) ?? 0) + 1);
    }

    const representative = graph.nodes.find(node =>
      titleCounts.get(node.title) === 1
      && typeof node.metadata.sectionHash === 'string'
      && node.contentBlocks.some(block => block.type === 'code' || block.type === 'prompt')
    );
    assert.ok(representative, `Expected a unique fenced-code section in ${playbook.fileName}`);

    const result = await syncSection(fixturePath, {
      hash: representative.metadata.sectionHash as string,
      originalHeading: representative.title,
      newHeading: representative.title,
      newContent: representative.content,
    });

    assert.equal(result.success, true, result.message);
    assert.equal(readFileSync(fixturePath, 'utf-8'), before);
  });
}
