import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanPresentationText,
  cleanPresentationCode,
  createPresentationText,
  hasPresentationTextLeak,
  stripUnicodeEmoji,
} from '../lib/canvas/presentation-text';

test('strips complete emoji clusters without leaving Unicode joiners or modifiers', () => {
  const cleaned = stripUnicodeEmoji(
    'A🚀B 👩🏽‍💻 family 👨‍👩‍👧‍👦 flags 🇨🇳 🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} key 1️⃣ end',
  );

  assert.equal(cleaned, 'AB  family  flags   key  end');
  assert.doesNotMatch(
    cleaned,
    /[\u200D\u20E3\uFE0F\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u{E0020}-\u{E007F}]/u,
  );
});

test('converts the finite status-token vocabulary before removing other emoji', () => {
  const cleaned = cleanPresentationText(
    '✅ **稳定**；❌ 失败；⚠️ 风险；🔄 处理中；🆕 能力；🟢 A；🟡 B；🔴 C；⚫ D；🚦 阶段；🚀 发布',
  );

  assert.equal(
    cleaned,
    '通过 稳定; 未通过 失败; 警告 风险; 进行中 处理中; 新增 能力; 绿色 A; 黄色 B; 红色 C; 黑色 D; 状态 阶段; 发布',
  );
});

test('removes common Markdown markers while preserving meaningful symbols', () => {
  const cleaned = cleanPresentationText(`
### **交付 \`$ % + - / < > ×\`**
> [参考链接](https://example.com)
- \`code\` and ~~obsolete~~
1. __final__
`);

  assert.equal(cleaned, '交付 $ % + - / < > × 参考链接 code and obsolete final');
  assert.match(cleaned, /\$ % \+ - \/ < > ×/u);
});

test('prefers product copy and falls back deterministically after cleaning', () => {
  const input = Object.freeze({
    sourceTitle: '## 🚀 **原始标题**',
    sourceSummary: '- 原始 `摘要`',
    productTitle: '## 产品化 **交付中心**',
    productSummary: '⚠️ 聚合上线前的验证与决策。',
    fallbackTitle: '备用标题',
    fallbackSummary: '备用摘要',
  });

  assert.deepEqual(createPresentationText(input), {
    displayTitle: '产品化 交付中心',
    displaySummary: '警告 聚合上线前的验证与决策。',
  });
  assert.equal(input.sourceTitle, '## 🚀 **原始标题**');

  assert.deepEqual(createPresentationText({
    sourceTitle: '🚀',
    sourceSummary: '  ',
    productTitle: '** **',
    productSummary: '👩🏽‍💻',
    fallbackTitle: '## **模块总览**',
    fallbackSummary: '- 暂无结构化摘要',
  }), {
    displayTitle: '模块总览',
    displaySummary: '暂无结构化摘要',
  });

  assert.deepEqual(createPresentationText({}), {
    displayTitle: '未命名区域',
    displaySummary: '暂无摘要',
  });
});

test('emoji and presentation cleaning are idempotent', () => {
  const source = '## ✅ **发布** 👩🏽‍💻\n> `$ % + - / < > ×`';
  const stripped = stripUnicodeEmoji(source);
  const cleaned = cleanPresentationText(source);

  assert.equal(stripUnicodeEmoji(stripped), stripped);
  assert.equal(cleanPresentationText(cleaned), cleaned);
  assert.deepEqual(
    createPresentationText({ sourceTitle: cleaned, sourceSummary: cleaned }),
    createPresentationText({
      sourceTitle: cleanPresentationText(cleaned),
      sourceSummary: cleanPresentationText(cleaned),
    }),
  );
});

test('keeps identifier underscores while remaining idempotent across collapsed lines', () => {
  const source = '`search_knowledge`\n`compare_frameworks` and _emphasis_';
  const cleaned = cleanPresentationText(source);

  assert.equal(cleaned, 'search_knowledge compare_frameworks and emphasis');
  assert.equal(cleanPresentationText(cleaned), cleaned);
});

test('normalizes circled section numbers without deleting business symbols', () => {
  assert.equal(
    cleanPresentationText('阶段⑥：$ % + - / < > ×'),
    '阶段6:$ % + - / < > ×',
  );
});

test('semanticizes decorative prose glyphs while keeping raw code layout intact', () => {
  const cleaned = cleanPresentationText('行业合规 (§3.7)；衔接 → 阶段2；增长 ↑；风险 ↓；回看 ← 输入');
  assert.equal(
    cleaned,
    '行业合规(第3.7节);衔接 至 阶段2;增长 向上;风险 向下;回看 来自 输入',
  );
  assert.doesNotMatch(cleaned, /[§↑↓→←]/u);

  const code = cleanPresentationCode('step → next\nsection §3 🚀');
  assert.equal(code.split('\n').length, 2);
  assert.doesNotMatch(code, /[§↑↓→←]|\p{Extended_Pictographic}/u);
});

test('detects export-visible emoji, decorative glyphs, and raw Markdown structure', () => {
  for (const value of ['🚀 发布', '阶段 → 发布', '参见 §3.7', '**raw**', '| --- |']) {
    assert.equal(hasPresentationTextLeak(value), true, value);
  }
  for (const value of ['C# API', 'A | B', '产品发布与运行']) {
    assert.equal(hasPresentationTextLeak(value), false, value);
  }
});

test('turns raw Markdown table metadata into bounded product text', () => {
  assert.equal(
    cleanPresentationText('| Capability | State |\n| --- | --- |\n| Export | Ready |'),
    'Capability · State Export · Ready',
  );
});
