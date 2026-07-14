import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildArchitectureViewModel } from '../lib/canvas/architecture-view-model';
import { parseMarkdownToGraph } from '../lib/parser/markdown-to-graph';
import type { DocCanvas } from '../lib/parser/types';

const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u;
const MARKDOWN_LEAK_PATTERN = /(?:^|\s)(?:#{1,6}|```|\|\s*\||[-*+]\s+|\[[ xX]\])(?:\s|$)/;

function loadBuiltin(id: string, path: string): DocCanvas {
  return parseMarkdownToGraph(readFileSync(path, 'utf8'), id, path);
}

function visibleRegionText(model: ReturnType<typeof buildArchitectureViewModel>): string[] {
  return model.regions.flatMap(region => [
    region.title,
    region.summary,
    ...region.resources.previews.map(preview => preview.title),
  ]);
}

test('lifecycle architecture uses nine stable product stages while retaining source headings', () => {
  const expected = [
    '使用入口',
    '机会与需求',
    '产品定义',
    '技术蓝图',
    '构建与交付',
    '质量保障',
    '发布与运行',
    '增长运营',
    '学习与进化',
  ];

  for (const [id, path] of [
    ['vibe-track', 'documents/VibeTrack.md'],
    ['v2-pro', 'documents/v2.7-Pro.md'],
  ] as const) {
    const graph = loadBuiltin(id, path);
    const model = buildArchitectureViewModel(graph);
    const stages = model.regions
      .filter(region => region.stageNumber !== undefined)
      .sort((left, right) => left.stageNumber! - right.stageNumber!);

    assert.deepEqual(stages.map(region => region.title), expected);
    assert.equal(stages.length, 9);
    assert.ok(stages.every(region => typeof region.sourceTitle === 'string' && region.sourceTitle.length > 0));
    assert.ok(stages.some(region => region.sourceTitle !== region.title));
    assert.match(model.graphFingerprint, /^graph-v3-/);
  }
});

test('Playbook module architecture groups source H2 sections into eight product capability domains', () => {
  const graph = loadBuiltin('playbook-v2', 'documents/Playbook-v2.md');
  const model = buildArchitectureViewModel(graph);
  const rooms = model.regions.filter(region => region.kind === 'room');

  assert.equal(model.mode, 'module');
  assert.deepEqual(rooms.map(region => region.title), [
    '使用导航与证据',
    '产品工厂运行模型',
    '产品定义与知识底座',
    '安全与治理',
    '自进化引擎',
    '交付与自动化',
    '经营与规模化',
    '边界与演进',
  ]);
  assert.equal(model.floors.length, 2);
  assert.ok(model.floors.every(floor => floor.regionIds.length === 4));

  const delivery = rooms.find(region => region.title === '交付与自动化');
  assert.ok(delivery);
  assert.deepEqual(delivery.nestedStageNumbers, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(delivery.headingNodeIds.length >= 3);

  assert.deepEqual(
    Object.keys(model.nodeRegionId).sort(),
    graph.nodes.map(node => node.id).sort(),
  );
  assert.match(model.graphFingerprint, /^graph-v3-/);

  const expectedDomainByHeading = new Map<string, string>([
    ['0. 文档架构总览', '使用导航与证据'],
    ['成熟度标注说明', '使用导航与证据'],
    ['关联审计文档', '使用导航与证据'],
    ['一、平台总览：从"开发一个产品"到"运营一个产品工厂"', '产品工厂运行模型'],
    ['二、产品基因组系统', '产品定义与知识底座'],
    ['七、共享组件库', '产品定义与知识底座'],
    ['MCP安全与传输：2026年7月最新状态', '安全与治理'],
    ['四、进化宪章：不可变的约束边界', '安全与治理'],
    ['十、进化宪章的执行机制', '安全与治理'],
    ['三、四维自进化引擎', '自进化引擎'],
    ['五、Codex可执行指令格式规范', '交付与自动化'],
    ['六、八阶段生命周期（Codex可执行版）', '交付与自动化'],
    ['八、平台级关键脚本清单', '交付与自动化'],
    ['九、财务模型与ROI分析', '经营与规模化'],
    ['附录：前瞻性能力（2026年不可用）', '边界与演进'],
    ['十一、一个人+Codex的实际限制', '边界与演进'],
    ['Changelog', '边界与演进'],
  ]);

  for (const heading of graph.nodes.filter(node => node.level === 2)) {
    const expectedDomain = expectedDomainByHeading.get(heading.title)
      ?? (heading.title.includes('Promotion State Machine') ? '安全与治理'
        : heading.title.includes('模块工具推荐目录') || heading.title.includes('关联脚本清单') ? '交付与自动化'
          : heading.title.includes('共享知识库系统') ? '产品定义与知识底座'
            : undefined);
    assert.ok(expectedDomain, `missing semantic expectation for ${heading.title}`);
    const region = rooms.find(candidate => candidate.id === model.nodeRegionId[heading.id]);
    assert.equal(region?.title, expectedDomain, heading.title);
  }

  const expectedEditorialCopy = new Map<string, readonly [string, string]>([
    ['5.1 每条指令的标准模板', ['标准指令模板', '规定任务、输入、输出、证据门和失败处理']],
    ['5.2 关键原则（来自2026年研究证据）', ['指令设计原则', '用约束、验证条件和失败边界提升执行可靠性']],
    ['模块化规范文件：project-spec/what-vision.md', ['产品愿景规范', '定义问题、用户、价值与成功条件']],
    ['模块化规范文件：project-spec/agents/agent-spec-{feature}.md', ['Agent 行为规范', '约束角色、输入、输出和失败边界']],
    ['模块化规范文件：project-spec/how-architecture.md', ['架构设计规范', '固定系统边界、数据流和关键技术决策']],
    ['模块化规范文件：project-spec/how-security.md + project-spec/how-testing.md', ['安全与质量规范', '同步加载安全约束与测试策略']],
    ['模块化规范文件：project-spec/how-testing.md', ['质量验证规范', '定义验证范围、证据和失败处理']],
    ['第〇部分：Codex 基础设施', ['Codex 基础设施工具', '组织代理运行所需的基础能力']],
    ['第一部分：知识架构', ['知识架构工具', '组织知识采集、检索与维护能力']],
    ['第二部分：Agent 工程', ['Agent 工程工具', '组织代理设计、编排与运行能力']],
    ['第三部分：评估体系', ['评估体系工具', '组织质量评估与回归验证能力']],
    ['第四至八部分：开发生命周期', ['生命周期工具', '覆盖构建、测试、发布与运营环节']],
  ]);

  for (const [sourceTitle, [title, summary]] of expectedEditorialCopy) {
    const source = graph.nodes.find(node => node.title === sourceTitle);
    assert.ok(source, sourceTitle);
    assert.deepEqual(model.nodePresentationCopy[source.id], { title, summary }, sourceTitle);
  }
});

test('architecture presentation text contains neither emoji nor raw Markdown structure', () => {
  for (const [id, path] of [
    ['vibe-track', 'documents/VibeTrack.md'],
    ['v2-pro', 'documents/v2.7-Pro.md'],
    ['playbook-v2', 'documents/Playbook-v2.md'],
  ] as const) {
    const model = buildArchitectureViewModel(loadBuiltin(id, path));
    for (const value of visibleRegionText(model)) {
      assert.equal(EMOJI_PATTERN.test(value), false, `${id} leaked emoji: ${value}`);
      assert.equal(MARKDOWN_LEAK_PATTERN.test(value), false, `${id} leaked Markdown: ${value}`);
    }
  }
});

test('foundation and annex nodes do not inherit one region heading as their own title', () => {
  for (const [id, path] of [
    ['vibe-track', 'documents/VibeTrack.md'],
    ['v2-pro', 'documents/v2.7-Pro.md'],
  ] as const) {
    const graph = loadBuiltin(id, path);
    const model = buildArchitectureViewModel(graph);
    const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
    for (const region of model.regions.filter(candidate => (
      candidate.kind === 'foundation' || candidate.kind === 'annex'
    ))) {
      const headings = region.nodeIds
        .map(nodeId => nodeById.get(nodeId))
        .filter((node): node is NonNullable<typeof node> => Boolean(node && node.level === 2));
      for (const heading of headings) {
        assert.notEqual(
          model.nodePresentationCopy[heading.id]?.title,
          region.title,
          `${id}:${heading.title}`,
        );
      }
    }
  }
});
