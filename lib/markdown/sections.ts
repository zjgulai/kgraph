import { createHash } from 'crypto';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';

interface MarkdownAstNode {
  type: string;
  value?: string;
  alt?: string;
  depth?: number;
  children?: MarkdownAstNode[];
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
}

export interface MarkdownSection {
  heading: string;
  depth: number;
  startOffset: number;
  headingEndOffset: number;
  bodyStartOffset: number;
  endOffset: number;
  body: string;
  hash: string;
}

function requiredOffset(offset: number | undefined, label: string): number {
  if (typeof offset !== 'number') {
    throw new Error(`Remark did not provide ${label} for a Markdown heading.`);
  }
  return offset;
}

function inlineText(node: MarkdownAstNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  if (node.type === 'image') return node.alt ?? '';
  if (node.children?.length) return node.children.map(inlineText).join('');
  return node.value ?? '';
}

function frontMatterEndOffset(markdown: string): number {
  const match = markdown.match(
    /^(?:\uFEFF)?---[^\S\r\n]*(?:\r\n|\n)[\s\S]*?(?:\r\n|\n)---[^\S\r\n]*(?:(?:\r\n|\n)|$)/,
  );
  return match?.[0].length ?? 0;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function sectionHash(headingText: string, content: string): string {
  const normalizedHeading = normalizeLineEndings(headingText.trim());
  const normalizedContent = normalizeLineEndings(content);
  return createHash('sha256')
    .update(`${normalizedHeading}\n${normalizedContent}`)
    .digest('hex')
    .slice(0, 12);
}

export function extractMarkdownSections(markdown: string): MarkdownSection[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MarkdownAstNode;
  const frontMatterEnd = frontMatterEndOffset(markdown);
  const headings = (tree.children ?? []).filter(node => {
    if (node.type !== 'heading') return false;
    const startOffset = requiredOffset(node.position?.start?.offset, 'start offset');
    return startOffset >= frontMatterEnd;
  });

  return headings.map((heading, index) => {
    const startOffset = requiredOffset(heading.position?.start?.offset, 'start offset');
    const headingEndOffset = requiredOffset(heading.position?.end?.offset, 'end offset');
    const newlineOffset = markdown.indexOf('\n', headingEndOffset);
    const bodyStartOffset = newlineOffset === -1 ? markdown.length : newlineOffset + 1;
    const nextHeading = headings[index + 1];
    const endOffset = nextHeading
      ? requiredOffset(nextHeading.position?.start?.offset, 'next heading start offset')
      : markdown.length;
    const body = markdown.slice(bodyStartOffset, endOffset);
    const headingText = inlineText(heading).trim();

    return {
      heading: headingText,
      depth: heading.depth ?? 1,
      startOffset,
      headingEndOffset,
      bodyStartOffset,
      endOffset,
      body,
      hash: sectionHash(headingText, body),
    };
  });
}
