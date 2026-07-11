/**
 * lib/sync/precise-sync.ts — Precise bidirectional sync between canvas nodes and Markdown files.
 *
 * Strategy: section→hash→lookup table. Every heading-level section in the source
 * .md file gets a stable hash. When the canvas saves a node, we find the matching
 * hash, replace the exact section in the file, and write back.
 *
 * This avoids the Phase 1 "append to end of file" limitation.
 */
import { readFileSync, existsSync } from 'fs';
import { atomicWriteText, withFileLock } from '@/lib/server/file-ops';
import { extractMarkdownSections, sectionHash, type MarkdownSection } from '@/lib/markdown/sections';

export { sectionHash };

export interface SyncTarget {
  documentId: string;
  filePath: string;
}

export interface SyncResult {
  success: boolean;
  hash?: string;
  operation: 'replace' | 'append' | 'conflict';
  message: string;
}

export interface SectionIndexEntry {
  start: number;
  end: number;
  heading: string;
  content: string;
  depth: string;
  hash: string;
}

export interface SyncSectionInput {
  hash?: string;
  originalHeading?: string;
  newHeading: string;
  newContent: string;
}

function toIndexEntry(section: MarkdownSection): SectionIndexEntry {
  return {
    start: section.startOffset,
    end: section.endOffset,
    heading: section.heading,
    content: section.body,
    depth: '#'.repeat(section.depth),
    hash: section.hash,
  };
}

/**
 * Parse a Markdown file into a hash lookup using the shared AST section contract.
 */
export function buildSectionIndex(filePath: string): Map<string, SectionIndexEntry> {
  const index = new Map<string, SectionIndexEntry>();
  if (!existsSync(filePath)) return index;

  const markdown = readFileSync(filePath, 'utf-8');
  for (const section of extractMarkdownSections(markdown)) {
    index.set(section.hash, toIndexEntry(section));
  }
  return index;
}

function findUniqueSection(sections: MarkdownSection[], input: SyncSectionInput): MarkdownSection | undefined {
  if (input.hash !== undefined) {
    const exactMatches = sections.filter(section => section.hash === input.hash);
    return exactMatches.length === 1 ? exactMatches[0] : undefined;
  }

  const heading = input.originalHeading?.trim();
  if (!heading) return undefined;

  const matches = sections.filter(section => section.heading === heading);
  if (matches.length === 1) return matches[0];
  return undefined;
}

function headingBodySeparator(markdown: string, section: MarkdownSection, newContent: string): string {
  const original = markdown.slice(section.headingEndOffset, section.bodyStartOffset);
  if (original) return original;
  if (!newContent) return '';
  return markdown.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Replace a section in the file identified by hash.
 *
 * @param filePath — path to the .md file
 * @param hash — stable section hash from sectionHash()
 * @param newHeading — updated heading (or same)
 * @param newContent — updated content body
 * @returns SyncResult with the operation performed
 */
export async function syncSection(
  filePath: string,
  input: SyncSectionInput
): Promise<SyncResult> {
  if (!existsSync(filePath)) {
    return { success: false, hash: input.hash, operation: 'conflict', message: `File not found: ${filePath}` };
  }

  return withFileLock(`${filePath}.lock`, () => {
    const markdown = readFileSync(filePath, 'utf-8');
    const sections = extractMarkdownSections(markdown);
    const section = findUniqueSection(sections, input);

    if (!section) {
      return {
        success: false,
        hash: input.hash,
        operation: 'conflict',
        message: 'Section was not uniquely matched. Reload the document before saving.',
      };
    }

    if (section.heading === input.newHeading && section.body === input.newContent) {
      return {
        success: true,
        hash: section.hash,
        operation: 'replace',
        message: `Section unchanged: "${section.heading}"`,
      };
    }

    const separator = headingBodySeparator(markdown, section, input.newContent);
    const heading = section.heading === input.newHeading
      ? markdown.slice(section.startOffset, section.headingEndOffset)
      : `${'#'.repeat(section.depth)} ${input.newHeading}`;
    const replacement = `${heading}${separator}${input.newContent}`;
    const updated = markdown.slice(0, section.startOffset) + replacement + markdown.slice(section.endOffset);
    const updatedSection = extractMarkdownSections(updated)
      .find(candidate => candidate.startOffset === section.startOffset);

    if (!updatedSection) {
      return {
        success: false,
        hash: input.hash,
        operation: 'conflict',
        message: 'Updated section could not be parsed. Reload the document before saving.',
      };
    }

    atomicWriteText(filePath, updated);

    return {
      success: true,
      hash: updatedSection.hash,
      operation: 'replace',
      message: `Section replaced: "${section.heading}" -> "${input.newHeading}"`,
    };
  });
}
