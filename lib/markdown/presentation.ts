import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

interface MarkdownAstNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  lang?: string | null;
  identifier?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  align?: Array<'left' | 'right' | 'center' | null>;
  children?: MarkdownAstNode[];
}

export type MarkdownInlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'emphasis' | 'delete'; children: MarkdownInlineNode[] }
  | { type: 'inlineCode'; value: string }
  | { type: 'link'; url?: string; title?: string; children: MarkdownInlineNode[] }
  | { type: 'break' }
  | { type: 'imagePlaceholder'; alt: string };

export interface MarkdownListItemNode {
  type: 'listItem';
  checked?: boolean;
  children: MarkdownBlockNode[];
}

export interface MarkdownTableCellNode {
  type: 'tableCell';
  children: MarkdownInlineNode[];
}

export interface MarkdownTableRowNode {
  type: 'tableRow';
  cells: MarkdownTableCellNode[];
}

export type MarkdownBlockNode =
  | { type: 'paragraph'; children: MarkdownInlineNode[] }
  | { type: 'heading'; depth: number; children: MarkdownInlineNode[] }
  | { type: 'code'; value: string; language?: string }
  | { type: 'blockquote'; children: MarkdownBlockNode[] }
  | { type: 'list'; ordered: boolean; start?: number; items: MarkdownListItemNode[] }
  | { type: 'thematicBreak' }
  | {
      type: 'table';
      align: Array<'left' | 'right' | 'center' | null>;
      rows: MarkdownTableRowNode[];
    };

export interface MarkdownSummaryOptions {
  maxCharacters?: number;
  maxBlocks?: number;
}

export interface MarkdownStructureSummary {
  text: string;
  structure: string;
  blockCount: number;
  paragraphCount: number;
  listItemCount: number;
  tableCount: number;
  codeBlockCount: number;
  quoteCount: number;
}

export type MarkdownPresentationTextContext = 'prose' | 'code' | 'alt' | 'title';
export type MarkdownPresentationTextTransform = (
  value: string,
  context: MarkdownPresentationTextContext,
) => string;

const CONTROL_OR_FORMAT = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\u2060\u2066-\u2069\ufeff]/u;
const SAFE_SCHEME = /^(?:https?|mailto):/iu;
const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:/iu;

interface MarkdownDefinition {
  url: string;
  title?: string;
}

type MarkdownDefinitions = Map<string, MarkdownDefinition>;

function definitionKey(identifier: string | undefined): string {
  return (identifier ?? '').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function decodeProtocolEntities(value: string): string {
  const codePoint = (raw: string, radix: number): string => {
    const parsed = Number.parseInt(raw, radix);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0x10ffff || (parsed >= 0xd800 && parsed <= 0xdfff)) {
      return '\0';
    }
    return String.fromCodePoint(parsed);
  };

  return value
    .replace(/&#x([0-9a-f]+);?/giu, (_, hex: string) => codePoint(hex, 16))
    .replace(/&#([0-9]+);?/gu, (_, decimal: string) => codePoint(decimal, 10))
    .replace(/&colon;?/giu, ':')
    .replace(/&tab;?/giu, '\t')
    .replace(/&newline;?/giu, '\n');
}

/**
 * Validate a Markdown destination without relying on the browser URL parser.
 * The returned value is safe to pass to React's `href`; `undefined` means the
 * renderer must preserve the label as plain text instead of creating a link.
 */
export function sanitizeMarkdownUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  const destination = value.trim();
  if (!destination || CONTROL_OR_FORMAT.test(destination)) return undefined;

  let probe = decodeProtocolEntities(destination);
  for (let attempt = 0; attempt < 3 && /%[0-9a-f]{2}/iu.test(probe); attempt += 1) {
    try {
      const decoded = decodeURIComponent(probe);
      if (decoded === probe) break;
      probe = decodeProtocolEntities(decoded);
    } catch {
      return undefined;
    }
  }

  if (CONTROL_OR_FORMAT.test(probe)) return undefined;
  const normalized = probe.toLowerCase();

  if (SAFE_SCHEME.test(normalized)) return destination;
  if (normalized.startsWith('//') || normalized.startsWith('\\\\')) return undefined;
  if (EXPLICIT_SCHEME.test(normalized)) return undefined;
  return destination;
}

function inlineNodes(
  nodes: MarkdownAstNode[] | undefined,
  definitions: MarkdownDefinitions,
): MarkdownInlineNode[] {
  const result: MarkdownInlineNode[] = [];

  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'text':
        if (node.value) result.push({ type: 'text', value: node.value });
        break;
      case 'strong':
      case 'emphasis':
      case 'delete': {
        const children = inlineNodes(node.children, definitions);
        if (children.length > 0) result.push({ type: node.type, children });
        break;
      }
      case 'inlineCode':
        result.push({ type: 'inlineCode', value: node.value ?? '' });
        break;
      case 'link': {
        const children = inlineNodes(node.children, definitions);
        result.push({
          type: 'link',
          url: sanitizeMarkdownUrl(node.url),
          title: node.title ?? undefined,
          children,
        });
        break;
      }
      case 'linkReference': {
        const children = inlineNodes(node.children, definitions);
        const definition = definitions.get(definitionKey(node.identifier));
        if (definition) {
          result.push({
            type: 'link',
            url: sanitizeMarkdownUrl(definition.url),
            title: definition.title,
            children,
          });
        } else if (children.length > 0) {
          result.push(...children);
        }
        break;
      }
      case 'image':
      case 'imageReference':
        result.push({ type: 'imagePlaceholder', alt: (node.alt ?? '图片').trim() || '图片' });
        break;
      case 'break':
        result.push({ type: 'break' });
        break;
      case 'html':
      case 'footnoteReference':
        break;
      default: {
        const children = inlineNodes(node.children, definitions);
        if (children.length > 0) result.push(...children);
      }
    }
  }

  return result;
}

function blockNodes(
  nodes: MarkdownAstNode[] | undefined,
  definitions: MarkdownDefinitions,
): MarkdownBlockNode[] {
  const result: MarkdownBlockNode[] = [];

  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'paragraph': {
        const children = inlineNodes(node.children, definitions);
        if (children.length > 0) result.push({ type: 'paragraph', children });
        break;
      }
      case 'heading': {
        const children = inlineNodes(node.children, definitions);
        if (children.length > 0) {
          result.push({ type: 'heading', depth: Math.min(6, Math.max(1, node.depth ?? 2)), children });
        }
        break;
      }
      case 'code':
        result.push({
          type: 'code',
          value: node.value ?? '',
          language: node.lang?.trim() || undefined,
        });
        break;
      case 'blockquote': {
        const children = blockNodes(node.children, definitions);
        if (children.length > 0) result.push({ type: 'blockquote', children });
        break;
      }
      case 'list': {
        const items = (node.children ?? [])
          .filter((item) => item.type === 'listItem')
          .map<MarkdownListItemNode>((item) => ({
            type: 'listItem',
            checked: typeof item.checked === 'boolean' ? item.checked : undefined,
            children: blockNodes(item.children, definitions),
          }))
          .filter((item) => item.children.length > 0);
        if (items.length > 0) {
          result.push({
            type: 'list',
            ordered: node.ordered === true,
            start: typeof node.start === 'number' ? node.start : undefined,
            items,
          });
        }
        break;
      }
      case 'thematicBreak':
        result.push({ type: 'thematicBreak' });
        break;
      case 'table': {
        const rows = (node.children ?? []).map<MarkdownTableRowNode>((row) => ({
          type: 'tableRow',
          cells: (row.children ?? []).map<MarkdownTableCellNode>((cell) => ({
            type: 'tableCell',
            children: inlineNodes(cell.children, definitions),
          })),
        }));
        if (rows.length > 0) result.push({ type: 'table', align: node.align ?? [], rows });
        break;
      }
      case 'html':
      case 'definition':
      case 'yaml':
        break;
      default: {
        const children = blockNodes(node.children, definitions);
        if (children.length > 0) result.push(...children);
      }
    }
  }

  return result;
}

/** Parse raw Markdown into a serializable, display-only allowlist AST. */
export function parseMarkdownPresentation(markdown: string): MarkdownBlockNode[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownAstNode;
  const definitions: MarkdownDefinitions = new Map();
  for (const node of tree.children ?? []) {
    if (node.type !== 'definition' || !node.url) continue;
    const key = definitionKey(node.identifier);
    if (key) definitions.set(key, { url: node.url, title: node.title ?? undefined });
  }
  return blockNodes(tree.children, definitions);
}

function mapInlinePresentationText(
  nodes: readonly MarkdownInlineNode[],
  transform: MarkdownPresentationTextTransform,
): MarkdownInlineNode[] {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return { ...node, value: transform(node.value, 'prose') };
      case 'strong':
      case 'emphasis':
      case 'delete':
        return { ...node, children: mapInlinePresentationText(node.children, transform) };
      case 'inlineCode':
        return { ...node, value: transform(node.value, 'code') };
      case 'link':
        return {
          ...node,
          title: node.title === undefined ? undefined : transform(node.title, 'title'),
          children: mapInlinePresentationText(node.children, transform),
        };
      case 'imagePlaceholder':
        return { ...node, alt: transform(node.alt, 'alt') };
      case 'break':
        return { ...node };
    }
  });
}

/**
 * Create a display-only AST with every visible text leaf transformed by context.
 * The source AST and link destinations remain byte-for-byte unchanged.
 */
export function mapMarkdownPresentationText(
  blocks: readonly MarkdownBlockNode[],
  transform: MarkdownPresentationTextTransform,
): MarkdownBlockNode[] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        return { ...block, children: mapInlinePresentationText(block.children, transform) };
      case 'code':
        return { ...block, value: transform(block.value, 'code') };
      case 'blockquote':
        return { ...block, children: mapMarkdownPresentationText(block.children, transform) };
      case 'list':
        return {
          ...block,
          items: block.items.map((item) => ({
            ...item,
            children: mapMarkdownPresentationText(item.children, transform),
          })),
        };
      case 'table':
        return {
          ...block,
          align: [...block.align],
          rows: block.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              children: mapInlinePresentationText(cell.children, transform),
            })),
          })),
        };
      case 'thematicBreak':
        return { ...block };
    }
  });
}

function inlineText(nodes: MarkdownInlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inlineCode':
          return node.value;
        case 'strong':
        case 'emphasis':
        case 'delete':
        case 'link':
          return inlineText(node.children);
        case 'break':
          return ' ';
        case 'imagePlaceholder':
          return node.alt;
      }
    })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

function blockText(node: MarkdownBlockNode): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(node.children);
    case 'code':
      return '代码示例';
    case 'blockquote':
      return node.children.map(blockText).join(' ');
    case 'list':
      return node.items.flatMap((item) => item.children.map(blockText)).join(' ');
    case 'thematicBreak':
      return '';
    case 'table':
      return node.rows
        .flatMap((row) => row.cells.map((cell) => inlineText(cell.children)))
        .join(' ');
  }
}

function boundedBlockCount(value: number | undefined, available: number): number {
  if (value === undefined) return available;
  if (!Number.isFinite(value)) return available;
  return Math.max(0, Math.min(available, Math.floor(value)));
}

function boundedCharacterCount(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 240;
  return Math.max(1, Math.floor(value));
}

function truncateText(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  if (characters.length <= maxCharacters) return value;
  return `${characters.slice(0, maxCharacters).join('').trimEnd()}…`;
}

function textFromBlocks(blocks: MarkdownBlockNode[], options: MarkdownSummaryOptions): string {
  const visible = blocks.slice(0, boundedBlockCount(options.maxBlocks, blocks.length));
  const text = visible.map(blockText).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
  return truncateText(text, boundedCharacterCount(options.maxCharacters));
}

/** Return plain semantic text for compact cards; Markdown markers never survive. */
export function markdownToBoundedText(markdown: string, options: MarkdownSummaryOptions = {}): string {
  return textFromBlocks(parseMarkdownPresentation(markdown), options);
}

function pluralPart(count: number, singular: string): string | undefined {
  return count > 0 ? `${count} ${singular}` : undefined;
}

/** Return bounded plain text plus deterministic structural counts for card metadata. */
export function summarizeMarkdownStructure(
  markdown: string,
  options: MarkdownSummaryOptions = {},
): MarkdownStructureSummary {
  const blocks = parseMarkdownPresentation(markdown);
  let paragraphCount = 0;
  let listItemCount = 0;
  let tableCount = 0;
  let codeBlockCount = 0;
  let quoteCount = 0;

  const visit = (node: MarkdownBlockNode, insideListItem = false): void => {
    switch (node.type) {
      case 'paragraph':
        if (!insideListItem) paragraphCount += 1;
        break;
      case 'list':
        listItemCount += node.items.length;
        for (const item of node.items) {
          for (const child of item.children) visit(child, true);
        }
        break;
      case 'table':
        tableCount += 1;
        break;
      case 'code':
        codeBlockCount += 1;
        break;
      case 'blockquote':
        quoteCount += 1;
        for (const child of node.children) visit(child, insideListItem);
        break;
      case 'heading':
      case 'thematicBreak':
        break;
    }
  };
  for (const block of blocks) visit(block);

  const structure = [
    pluralPart(paragraphCount, '段正文'),
    pluralPart(listItemCount, '项清单'),
    pluralPart(tableCount, '张表格'),
    pluralPart(codeBlockCount, '个代码示例'),
    pluralPart(quoteCount, '段引用'),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return {
    text: textFromBlocks(blocks, options),
    structure,
    blockCount: blocks.length,
    paragraphCount,
    listItemCount,
    tableCount,
    codeBlockCount,
    quoteCount,
  };
}
