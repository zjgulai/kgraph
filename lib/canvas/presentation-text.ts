export interface PresentationTextInput {
  sourceTitle?: string | null;
  sourceSummary?: string | null;
  productTitle?: string | null;
  productSummary?: string | null;
  fallbackTitle?: string | null;
  fallbackSummary?: string | null;
}

export interface PresentationText {
  displayTitle: string;
  displaySummary: string;
}

const DEFAULT_TITLE = '未命名区域';
const DEFAULT_SUMMARY = '暂无摘要';

/**
 * These replacements are intentionally finite. They retain status information
 * that would otherwise disappear with the rest of the decorative emoji.
 */
const STATUS_TOKEN_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/✅(?:\uFE0F)?/gu, '通过'],
  [/❌(?:\uFE0F)?/gu, '未通过'],
  [/⚠(?:\uFE0F)?/gu, '警告'],
  [/🔄(?:\uFE0F)?/gu, '进行中'],
  [/🆕(?:\uFE0F)?/gu, '新增'],
  [/🟢(?:\uFE0F)?/gu, '绿色'],
  [/🟡(?:\uFE0F)?/gu, '黄色'],
  [/🔴(?:\uFE0F)?/gu, '红色'],
  [/⚫(?:\uFE0F)?/gu, '黑色'],
  [/🚦(?:\uFE0F)?/gu, '状态'],
];

const EMOJI_CLUSTER = /(?:[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0E|\uFE0F)?(?:\p{Emoji_Modifier})?)*)(?:[\u{E0020}-\u{E007E}]+\u{E007F})?/gu;
const ORPHAN_EMOJI_COMPONENT = /[\u200D\u20E3\uFE0E\uFE0F\u{E0020}-\u{E007F}]|\p{Emoji_Modifier}|\p{Regional_Indicator}/gu;
const DECORATIVE_PRESENTATION_GLYPH = /[§↑↓→←]/u;
const MARKDOWN_PRESENTATION_STRUCTURE = /(?:^|\s)(?:#{1,6}\s|`{3,}|~{3,}|>\s|[-+*]\s|\d{1,9}[.)]\s|\[[ xX]\]\s)|(?:\*\*|__|~~)|(?:^|\|)\s*:?-{3,}:?\s*(?:\||$)/mu;

export function stripUnicodeEmoji(value: string): string {
  return value
    .replace(EMOJI_CLUSTER, '')
    .replace(ORPHAN_EMOJI_COMPONENT, '');
}

function semanticizeStatusTokens(value: string): string {
  return STATUS_TOKEN_RULES.reduce(
    (result, [pattern, label]) => result.replace(pattern, ` ${label} `),
    value,
  );
}

function semanticizeDecorativeGlyphs(value: string): string {
  return value
    .replace(/§[ \t]*(\d+(?:\.\d+)*)/gu, '第$1节')
    .replace(/§/gu, '章节')
    .replace(/[ \t]*→[ \t]*/gu, ' 至 ')
    .replace(/[ \t]*←[ \t]*/gu, ' 来自 ')
    .replace(/[ \t]*↑[ \t]*/gu, ' 向上 ')
    .replace(/[ \t]*↓[ \t]*/gu, ' 向下 ');
}

function removeMarkdownMarkers(value: string): string {
  return value
    .replace(/^[ \t]*(?:`{3,}|~{3,})[^\n]*$/gmu, ' ')
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gmu, ' ')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gmu, '')
    .replace(/^[ \t]{0,3}(?:>[ \t]?)+/gmu, '')
    .replace(/^[ \t]{0,3}[-+*][ \t]+/gmu, '')
    .replace(/^[ \t]{0,3}\d{1,9}[.)][ \t]+/gmu, '')
    .replace(/^[ \t]*\[[xX]\][ \t]*/gmu, '已完成 ')
    .replace(/^[ \t]*\[ \][ \t]*/gmu, '待处理 ')
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*$/gmu, ' ')
    .replace(/^[ \t]*\|[ \t]*/gmu, '')
    .replace(/[ \t]*\|[ \t]*$/gmu, '')
    .replace(/[ \t]*\|[ \t]*/gu, ' · ')
    .replace(/!\[([^\]]*)\]\([^\n)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^\n)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/gu, '$1')
    .replace(/`([^`\n]+)`/gu, '$1')
    .replace(/(\*\*|__)([^\n]+?)\1/gu, '$2')
    .replace(/~~([^\n]+?)~~/gu, '$1')
    .replace(/\*([^*\n]+)\*/gu, '$1')
    .replace(/(^|[^\p{L}\p{N}])_([^_\n]+?)_(?![\p{L}\p{N}])/gmu, '$1$2')
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/gu, '$1');
}

export function cleanPresentationText(value: string | null | undefined): string {
  if (!value) return '';

  return removeMarkdownMarkers(stripUnicodeEmoji(semanticizeStatusTokens(
    semanticizeDecorativeGlyphs(value.normalize('NFKC')),
  )))
    .replace(/\s+/gu, ' ')
    .replace(/\s+([,.;:!?，。；：！？、])/gu, '$1')
    .replace(/([，。；：！？、])\s+/gu, '$1')
    .replace(/\s+([（【(])/gu, '$1')
    .replace(/([（【(])\s+/gu, '$1')
    .replace(/\s+([）】)])/gu, '$1')
    .trim();
}

/** Preserve code spacing and syntax while removing product-display-only glyphs. */
export function cleanPresentationCode(value: string): string {
  return stripUnicodeEmoji(value).replace(/[§↑↓→←]/gu, '');
}

/** True when an export-visible string still contains raw presentation syntax. */
export function hasPresentationTextLeak(value: string): boolean {
  return stripUnicodeEmoji(value) !== value
    || DECORATIVE_PRESENTATION_GLYPH.test(value)
    || MARKDOWN_PRESENTATION_STRUCTURE.test(value);
}

function firstCleanValue(values: ReadonlyArray<string | null | undefined>): string {
  for (const value of values) {
    const cleaned = cleanPresentationText(value);
    if (cleaned) return cleaned;
  }
  return '';
}

export function createPresentationText(
  input: Readonly<PresentationTextInput>,
): PresentationText {
  return {
    displayTitle: firstCleanValue([
      input.productTitle,
      input.sourceTitle,
      input.fallbackTitle,
      DEFAULT_TITLE,
    ]),
    displaySummary: firstCleanValue([
      input.productSummary,
      input.sourceSummary,
      input.fallbackSummary,
      DEFAULT_SUMMARY,
    ]),
  };
}
