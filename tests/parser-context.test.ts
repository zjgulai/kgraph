import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';

const MARKDOWN = `# Doc

## 阶段① 发现

### 🚀 Vibe Track

#### Work

Use **Mastra** here.

### 🛠️ Pro Track

#### Review

Review the implementation.

## 阶段② 交付

### Handoff

Ship it.
`;

test('inherits stage and track context without turning descendants into track nodes', () => {
  const graph = parseMarkdownToGraph(MARKDOWN, 'fixture', '/fixture.md');
  const byTitle = (title: string) => {
    const node = graph.nodes.find(candidate => candidate.title === title);
    assert.ok(node, `missing node: ${title}`);
    return node;
  };

  assert.deepEqual(
    { stageNumber: byTitle('Work').stageNumber, track: byTitle('Work').track },
    { stageNumber: 1, track: 'vibe' },
  );
  assert.equal(byTitle('Work').type, 'subsection');
  assert.deepEqual(
    { stageNumber: byTitle('Review').stageNumber, track: byTitle('Review').track },
    { stageNumber: 1, track: 'pro' },
  );
  assert.deepEqual(
    { stageNumber: byTitle('Handoff').stageNumber, track: byTitle('Handoff').track },
    { stageNumber: 2, track: undefined },
  );

  const mastra = byTitle('Mastra');
  assert.deepEqual(
    { stageNumber: mastra.stageNumber, track: mastra.track },
    { stageNumber: 1, track: 'vibe' },
  );
});

test('marks only explicit stage headings for the stage trunk', () => {
  const graph = parseMarkdownToGraph(MARKDOWN, 'fixture', '/fixture.md');
  const stageHeadings = graph.nodes.filter(node => node.metadata.isStageHeading === true);

  assert.deepEqual(stageHeadings.map(node => node.stageNumber), [1, 2]);
  assert.equal(graph.edges.filter(edge => edge.id.startsWith('edge-stage-')).length, 2);
});

test('does not promote decimal subsection headings into duplicate stage zero nodes', () => {
  const graph = parseMarkdownToGraph(`# Doc

## 0. 文档架构总览

### 0.1 主力工具链

### 0.2 MCP 基础设施

## 阶段① 发现
`, 'fixture', '/fixture.md');

  const stageHeadings = graph.nodes.filter(node => node.metadata.isStageHeading === true);
  assert.deepEqual(stageHeadings.map(node => node.stageNumber), [0, 1]);
  assert.equal(graph.edges.filter(edge => edge.id.startsWith('edge-stage-')).length, 2);
});
