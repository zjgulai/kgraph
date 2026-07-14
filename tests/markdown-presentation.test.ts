import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SafeMarkdown } from '../components/canvas/SafeMarkdown';
import {
  markdownToBoundedText,
  mapMarkdownPresentationText,
  parseMarkdownPresentation,
  sanitizeMarkdownUrl,
  summarizeMarkdownStructure,
} from '../lib/markdown/presentation';

function render(markdown: string, maxBlocks?: number): string {
  return renderToStaticMarkup(createElement(SafeMarkdown, { markdown, maxBlocks }));
}

test('renders supported Markdown as semantic elements without raw syntax', () => {
  const html = render(`
Plain **strong**, *emphasis*, ~~removed~~ and \`inline()\` with [guide](https://example.com/docs).

Read the [reference guide][manual].

[manual]: /manual/start

> A quoted decision.

---

- First item
- [x] Finished item
- [ ] Open item

3. Third step
4. Fourth step

| Name | State |
| --- | --- |
| Build | Ready |

\`\`\`ts
const ready = true;
\`\`\`
`);

  assert.match(html, /<strong>strong<\/strong>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<del>removed<\/del>/);
  assert.match(html, /<code>inline\(\)<\/code>/);
  assert.match(html, /<a href="https:\/\/example\.com\/docs"[^>]*>guide<\/a>/);
  assert.match(html, /<a href="\/manual\/start"[^>]*>reference guide<\/a>/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<hr/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol start="3"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked=""/);
  assert.match(html, /<table/);
  assert.match(html, /<th>Name<\/th>/);
  assert.match(html, /<td>Ready<\/td>/);
  assert.match(html, /<pre/);
  assert.match(html, /data-language="ts"/);
  assert.doesNotMatch(html, /\*\*strong\*\*|\| --- \||```/);
});

test('never executes raw HTML, unsafe links, or remote images', () => {
  const html = render(`
<script>globalThis.compromised = true</script>

[script](javascript:alert(1))
[data](data:text/html,unsafe)
[obfuscated](java&#x73;cript:alert(1))
[encoded](javascript%3Aalert(1))
[safe relative](../guide/start)

![remote diagram](https://example.com/private.png)
`);

  assert.doesNotMatch(html, /<script|<img/i);
  assert.doesNotMatch(html, /href="(?:javascript|data):/i);
  assert.doesNotMatch(html, /example\.com\/private\.png/);
  assert.match(html, />script<\/span>/);
  assert.match(html, />data<\/span>/);
  assert.match(html, />obfuscated<\/span>/);
  assert.match(html, />encoded<\/span>/);
  assert.match(html, /href="\.\.\/guide\/start"/);
  assert.match(html, /remote diagram/);
});

test('allows only relative, fragment, http, https, and mailto destinations', () => {
  const allowed = [
    '/docs/start',
    './next',
    '../previous',
    'guide/intro',
    '?view=full',
    '#stage-1',
    'http://example.com',
    'HTTPS://example.com/path',
    'mailto:owner@example.com',
  ];
  for (const value of allowed) assert.equal(sanitizeMarkdownUrl(value), value);

  const rejected = [
    '//example.com/path',
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    'java&#x73;cript:alert(1)',
    'java&#99999999;script:alert(1)',
    'javascript%3Aalert(1)',
    'data:text/html,unsafe',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ];
  for (const value of rejected) assert.equal(sanitizeMarkdownUrl(value), undefined);
});

test('creates bounded plain text and a marker-free structural summary for cards', () => {
  const markdown = `
**Launch plan** starts with [research](./research).

- Interview five users
- Compare three alternatives

| Owner | Due |
| --- | --- |
| Product | Friday |

\`\`\`sh
npm run verify:local
\`\`\`
`;

  const text = markdownToBoundedText(markdown, { maxCharacters: 54 });
  const summary = summarizeMarkdownStructure(markdown, { maxCharacters: 120 });

  assert.equal(text, 'Launch plan starts with research. Interview five users…');
  assert.equal(summary.paragraphCount, 1);
  assert.equal(summary.listItemCount, 2);
  assert.equal(summary.tableCount, 1);
  assert.equal(summary.codeBlockCount, 1);
  assert.equal(summary.blockCount, 4);
  assert.equal(summary.structure, '1 段正文 · 2 项清单 · 1 张表格 · 1 个代码示例');
  assert.doesNotMatch(summary.text, /\*\*|\[[^\]]+\]\(|^\s*[-*+]\s|\|\s*---|```|npm run/u);
  assert.ok(summary.text.length <= 120);
});

test('supports deterministic top-level block limits without mutating source Markdown', () => {
  const markdown = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
  const before = markdown;
  const blocks = parseMarkdownPresentation(markdown);
  const html = render(markdown, 2);

  assert.equal(blocks.length, 3);
  assert.match(html, /First paragraph/);
  assert.match(html, /Second paragraph/);
  assert.doesNotMatch(html, /Third paragraph/);
  assert.equal(markdown, before);
});

test('maps presentation leaves by context without mutating source AST or link destinations', () => {
  const blocks = parseMarkdownPresentation(`
Paragraph text with \`inline code\` and [guide](https://example.com "Link title").

![diagram](https://example.com/diagram.png)

\`\`\`ts
const value = true;
\`\`\`
`);
  const before = JSON.stringify(blocks);
  const contexts: string[] = [];
  const mapped = mapMarkdownPresentationText(blocks, (value, context) => {
    contexts.push(context);
    return `[${context}]${value}`;
  });

  assert.deepEqual(new Set(contexts), new Set(['prose', 'code', 'title', 'alt']));
  assert.equal(JSON.stringify(blocks), before);
  assert.notEqual(mapped, blocks);
  assert.match(JSON.stringify(mapped), /https:\/\/example\.com/);
  assert.doesNotMatch(JSON.stringify(mapped), /\[prose\]https:\/\//);
});

test('default renderer removes Unicode emoji from every visible Markdown leaf without mutating input', () => {
  const markdown = `
Decision ✅ with \`inline 🚀 code\` and [guide](./guide "Read 🔗 guide").

![System 🚦 diagram](https://example.com/diagram.png)

\`\`\`text
deploy 🛠️ safely
\`\`\`
`;
  const rawBefore = markdown;
  const blocks = parseMarkdownPresentation(markdown);
  const astBefore = JSON.stringify(blocks);
  const html = renderToStaticMarkup(createElement(SafeMarkdown, { blocks }));
  const emoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\u20E3]/u;

  assert.equal(emoji.test(html), false, html);
  assert.match(html, /Decision/);
  assert.match(html, /inline  code/);
  assert.match(html, /System 状态 diagram/);
  assert.match(html, /title="Read guide"/);
  assert.match(html, /deploy  safely/);
  assert.equal(markdown, rawBefore);
  assert.equal(JSON.stringify(blocks), astBefore);
});

test('default renderer cleans Markdown markers and decorative glyphs from titles, alt text, and prose', () => {
  const html = render(`
[guide](/guide "**raw title** →")

![**raw alt** ↓](https://example.com/diagram.png)

参见 §3.7，流程 A → B。
`);

  assert.match(html, /title="raw title 至"/);
  assert.match(html, /raw alt 向下/);
  assert.match(html, /第3\.7节/);
  assert.doesNotMatch(html, /\*\*|[§↑↓→←]/u);
});
