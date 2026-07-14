import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildDocumentPresentation,
  type DocumentPresentation,
} from '../lib/canvas/document-presentation';
import type { MarkdownBlockNode, MarkdownInlineNode } from '../lib/markdown/presentation';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';
import type { DocCanvas, DocNode } from '../lib/parser/types';

const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u;
const DECORATIVE_PATTERN = /[§↑↓→←]/u;
const MARKDOWN_LEAK_PATTERN = /(?:^|\s)(?:#{1,6}|```|\|\s*\||[-*+]\s+|\[[ xX]\])(?:\s|$)/u;

function node(overrides: Partial<DocNode> & Pick<DocNode, 'id' | 'title'>): DocNode {
  const { id, title, ...rest } = overrides;
  return {
    id,
    type: 'section',
    title,
    content: '',
    summary: '',
    level: 2,
    position: { x: 0, y: 0 },
    contentBlocks: [],
    metadata: {},
    children: [],
    ...rest,
  };
}

function fixture(): DocCanvas {
  return {
    id: 'editorial-fixture',
    title: '🚀 **产品工厂**',
    version: 'v1',
    documentPath: '/fixtures/editorial.md',
    nodes: [
      node({
        id: 'stage-6',
        title: '## 🚀 阶段⑥：上线、发布与持续运行',
        summary: '- **锁定** 候选、配置和回滚证据。',
        content: `
**发布检查** 🚀

- ✅ 固定候选
- [部署指南](https://example.com/deploy "🚀 **部署指南**")

![架构图 🚀](https://example.com/private.png)

\`\`\`sh
🚀 deploy --ratio "$5% + 2 - 1 / 3 < 4 > 2 × 1"
\`\`\`
`,
        stageNumber: 6,
        track: 'both',
        contentBlocks: [
          { type: 'paragraph', content: '**发布检查** 🚀' },
          { type: 'list', content: '- ✅ 固定候选' },
          { type: 'code', language: 'sh', content: '🚀 deploy --ratio "$5%"' },
        ],
        metadata: { isStageHeading: true },
      }),
      node({
        id: 'release-tool',
        type: 'tool',
        title: '🛠️ **发布检查器**',
        summary: '| Raw | Table |\n| --- | --- |',
        content: 'Run the release checks.',
        contentBlocks: [{ type: 'table', content: 'Raw | Table' }],
        track: 'pro',
        stageNumber: 6,
      }),
    ],
    edges: [],
    metadata: {
      totalSections: 2,
      depth: 2,
      lastParsed: '2026-07-14T00:00:00.000Z',
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function serializedProjection(presentation: DocumentPresentation): unknown {
  return {
    schema: presentation.schema,
    nodes: [...presentation.presentationByNodeId.entries()],
    regions: [...presentation.regionPresentationById.entries()],
    searchEntries: presentation.searchEntries,
  };
}

function inlineStrings(nodes: readonly MarkdownInlineNode[], context: 'prose' | 'code' = 'prose'): Array<readonly [string, string]> {
  return nodes.flatMap((item): Array<readonly [string, string]> => {
    switch (item.type) {
      case 'text':
        return [[context, item.value]];
      case 'inlineCode':
        return [['code', item.value]];
      case 'strong':
      case 'emphasis':
      case 'delete':
        return inlineStrings(item.children, context);
      case 'link':
        return [
          ...inlineStrings(item.children, context),
          ...(item.title ? ([['prose', item.title]] as const) : []),
        ];
      case 'imagePlaceholder':
        return [['prose', item.alt]];
      case 'break':
        return [];
    }
  });
}

function markdownStrings(blocks: readonly MarkdownBlockNode[]): Array<readonly [string, string]> {
  return blocks.flatMap((block): Array<readonly [string, string]> => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return inlineStrings(block.children);
      case 'code':
        return [['code', block.value]];
      case 'blockquote':
        return markdownStrings(block.children);
      case 'list':
        return block.items.flatMap(item => markdownStrings(item.children));
      case 'table':
        return block.rows.flatMap(row => row.cells.flatMap(cell => inlineStrings(cell.children)));
      case 'thematicBreak':
        return [];
    }
  });
}

test('builds one deterministic display projection without mutating the raw graph', () => {
  const graph = deepFreeze(fixture());
  const before = structuredClone(graph);
  const options = {
    regions: [{
      id: 'release-region',
      title: '🚀 **发布与运行**',
      summary: '- 固定候选、配置、切换和回滚证据。',
      headingNodeIds: ['stage-6'],
      nodeIds: ['stage-6', 'release-tool'],
    }],
    nodeRegionId: { 'stage-6': 'release-region', 'release-tool': 'release-region' },
  } as const;

  const first = buildDocumentPresentation(graph, options);
  const second = buildDocumentPresentation(graph, options);
  const stage = first.presentationByNodeId.get('stage-6');
  const tool = first.presentationByNodeId.get('release-tool');
  const region = first.regionPresentationById.get('release-region');

  assert.equal(first.schema, 'editorial-architecture-v1');
  assert.deepEqual(serializedProjection(first), serializedProjection(second));
  assert.deepEqual(graph, before);
  assert.deepEqual(stage, {
    nodeId: 'stage-6',
    displayTitle: '发布与运行',
    displaySummary: '固定候选、配置、切换和回滚证据。',
    sourceLabel: '阶段6:上线、发布与持续运行',
    badges: [
      { kind: 'stage', label: '阶段 6' },
      { kind: 'track', label: 'Shared' },
    ],
    previewKind: 'list',
    accessibleLabel: '发布与运行。固定候选、配置、切换和回滚证据。来源:阶段6:上线、发布与持续运行',
  });
  assert.equal(tool?.displayTitle, '发布检查器');
  assert.equal(tool?.displaySummary, '聚合资源');
  assert.deepEqual(region, {
    regionId: 'release-region',
    displayTitle: '发布与运行',
    displaySummary: '固定候选、配置、切换和回滚证据。',
    sourceLabels: ['阶段6:上线、发布与持续运行'],
    accessibleLabel: '发布与运行。固定候选、配置、切换和回滚证据。来源:阶段6:上线、发布与持续运行',
  });

  for (const presentation of first.presentationByNodeId.values()) {
    for (const value of [
      presentation.displayTitle,
      presentation.displaySummary,
      presentation.sourceLabel,
      presentation.accessibleLabel,
      ...presentation.badges.map(badge => badge.label),
    ]) {
      assert.equal(EMOJI_PATTERN.test(value), false, value);
      assert.equal(DECORATIVE_PATTERN.test(value), false, value);
      assert.equal(MARKDOWN_LEAK_PATTERN.test(value), false, value);
    }
  }
  for (const presentation of first.regionPresentationById.values()) {
    for (const value of [
      presentation.displayTitle,
      presentation.displaySummary,
      presentation.accessibleLabel,
      ...presentation.sourceLabels,
    ]) {
      assert.equal(EMOJI_PATTERN.test(value), false, value);
      assert.equal(DECORATIVE_PATTERN.test(value), false, value);
      assert.equal(MARKDOWN_LEAK_PATTERN.test(value), false, value);
    }
  }
});

test('lazily maps every visible Markdown leaf and caches the display AST', () => {
  const graph = deepFreeze(fixture());
  const before = structuredClone(graph);
  const presentation = buildDocumentPresentation(graph);
  const first = presentation.getDisplayMarkdown('stage-6');
  const second = presentation.getDisplayMarkdown('stage-6');
  const missing = presentation.getDisplayMarkdown('missing');

  assert.strictEqual(first, second);
  assert.deepEqual(missing, []);
  assert.ok(Object.isFrozen(missing));
  assert.deepEqual(graph, before);
  assert.match(graph.nodes[0].content, /🚀|\*\*|```/u);

  const leaves = markdownStrings(first);
  assert.ok(leaves.length > 0);
  for (const [context, value] of leaves) {
    assert.equal(EMOJI_PATTERN.test(value), false, value);
    assert.equal(DECORATIVE_PATTERN.test(value), false, value);
    if (context === 'prose') assert.equal(MARKDOWN_LEAK_PATTERN.test(value), false, value);
  }

  const code = first.find((block): block is Extract<MarkdownBlockNode, { type: 'code' }> => block.type === 'code');
  assert.ok(code);
  assert.match(code.value, /\$5% \+ 2 - 1 \/ 3 < 4 > 2 × 1/u);
});

test('derives editorial fallback copy instead of repeating numbered source headings and first paragraphs', () => {
  const raw = node({
    id: 'instruction-principles',
    title: '5.2 关键原则（来自2026年研究证据）',
    content: '原则1：负面约束 > 正面指令',
    summary: '原则1：负面约束 > 正面指令',
    level: 3,
    contentBlocks: [{ type: 'paragraph', content: '原则1：负面约束 > 正面指令' }],
  });
  const presentation = buildDocumentPresentation({ nodes: [raw] });
  const display = presentation.presentationByNodeId.get(raw.id);

  assert.equal(display?.displayTitle, '关键原则');
  assert.equal(display?.displaySummary, '说明关键原则的目标与关键要求');
  assert.equal(display?.sourceLabel, '5.2 关键原则(来自2026年研究证据)');
  assert.notEqual(display?.displaySummary, '原则1:负面约束 > 正面指令');
  assert.equal(raw.title, '5.2 关键原则（来自2026年研究证据）');
  assert.equal(raw.content, '原则1：负面约束 > 正面指令');
});

test('turns specification paths into product labels while retaining searchable provenance', () => {
  const raw = node({
    id: 'testing-spec',
    title: '模块化规范文件：project-spec/how-testing.md',
    level: 4,
    content: '测试与验收规则',
    contentBlocks: [{ type: 'paragraph', content: '测试与验收规则' }],
  });
  const presentation = buildDocumentPresentation({ nodes: [raw] });
  const display = presentation.presentationByNodeId.get(raw.id);

  assert.equal(display?.displayTitle, '质量验证规范');
  assert.equal(display?.displaySummary, '说明质量验证规范的目标与关键要求');
  assert.equal(display?.sourceLabel, '模块化规范文件:project-spec/how-testing.md');
  assert.equal(presentation.search('project-spec/how-testing.md')[0]?.nodeId, raw.id);
  assert.equal(presentation.search('project-spec/how-testing.md')[0]?.displayTitle, '质量验证规范');
});

test('turns mechanical stage-transition headings into natural product navigation copy', () => {
  const raw = node({
    id: 'stage-transition',
    title: '衔接 → 阶段8',
    level: 3,
    stageNumber: 7,
    content: '完成增长运营后进入下一阶段。',
    contentBlocks: [{ type: 'paragraph', content: '完成增长运营后进入下一阶段。' }],
  });
  const presentation = buildDocumentPresentation({ nodes: [raw] });
  const display = presentation.presentationByNodeId.get(raw.id);

  assert.equal(display?.displayTitle, '进入学习与进化');
  assert.equal(display?.displaySummary, '说明进入学习与进化的目标与关键要求');
  assert.equal(display?.sourceLabel, '衔接 至 阶段8');
  assert.equal(raw.title, '衔接 → 阶段8');
});

test('all built-in node presentation strings are free of emoji and Markdown structure', () => {
  for (const [id, path] of [
    ['vibe-track', 'documents/VibeTrack.md'],
    ['v2-pro', 'documents/v2.7-Pro.md'],
    ['playbook-v2', 'documents/Playbook-v2.md'],
  ] as const) {
    const graph = parseMarkdownToGraph(readFileSync(path, 'utf8'), id, path);
    const presentation = buildDocumentPresentation(graph);
    for (const nodePresentation of presentation.presentationByNodeId.values()) {
      for (const value of [
        nodePresentation.displayTitle,
        nodePresentation.displaySummary,
        nodePresentation.sourceLabel,
        nodePresentation.accessibleLabel,
        ...nodePresentation.badges.map(badge => badge.label),
      ]) {
        assert.equal(EMOJI_PATTERN.test(value), false, `${id} emoji: ${value}`);
        assert.equal(DECORATIVE_PATTERN.test(value), false, `${id} decorative glyph: ${value}`);
        assert.equal(MARKDOWN_LEAK_PATTERN.test(value), false, `${id} Markdown: ${value}`);
      }
    }
    for (const node of graph.nodes) {
      for (const [, value] of markdownStrings(presentation.getDisplayMarkdown(node.id))) {
        assert.equal(EMOJI_PATTERN.test(value), false, `${id} Markdown emoji: ${value}`);
        assert.equal(DECORATIVE_PATTERN.test(value), false, `${id} Markdown decorative glyph: ${value}`);
      }
    }
  }
});
