import { createHash, randomUUID } from 'crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { buildArchitectureViewModel } from '@/lib/canvas/architecture-view-model';
import type { DocumentMutation, DocumentMutationRequest } from '@/lib/canvas/document-mutation-types';
import {
  applyDocumentSidecar,
  parsePresentationSidecar,
  type DocumentPresentationSidecar,
} from '@/lib/canvas/presentation-sidecar';
import { extractMarkdownSections, type MarkdownSection } from '@/lib/markdown/sections';
import { parseMarkdownToGraph } from '@/lib/parser/markdown-to-graph';
import type { DocCanvas, DocNode } from '@/lib/parser/types';
import { atomicWriteJson, atomicWriteText, withFileLock } from '@/lib/server/file-ops';
import { projectPath } from '@/lib/server/project-root';
import { assertKnownDocument } from '@/lib/shared/document-registry';
import { documentContentHash, presentationSidecarPath, readPresentationSidecar } from './presentation-store';

const REVISION_DIR = 'data/revisions';
const TRANSACTION_DIR = 'data/transactions';
const AUDIT_DIR = 'data/revision-audit';
const RETAIN_MINIMUM = 50;
const RETAIN_DAYS = 30;

const TransactionSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string(),
  snapshotDir: z.string(),
  hadPresentation: z.boolean(),
  beforeDocumentHash: z.string(),
  beforeRevision: z.number().int().min(0),
  afterDocumentHash: z.string(),
  afterRevision: z.number().int().min(1),
}).strict();

const AuditEntrySchema = z.object({
  mutationId: z.string().min(1),
  mutationType: z.string().min(1),
  revision: z.number().int().min(1),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  committedAt: z.string(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  baseRevision: z.number().int().min(0).optional(),
  baseDocumentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).passthrough();

export interface RevisionSummary {
  id: string;
  documentId: string;
  revision: number;
  createdAt: string;
  documentHash: string;
  mutationType: string;
}

interface RevisionManifest extends RevisionSummary {
  schemaVersion: 1;
  presentationHash: string;
}

interface MutationResult {
  document: DocCanvas;
  presentation: DocumentPresentationSidecar;
  revision: number;
  mutationId: string;
}

type MutationAuditEntry = z.infer<typeof AuditEntrySchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function requestHash(documentId: string, request: unknown): string {
  return createHash('sha256')
    .update(canonicalJson({ schemaVersion: 1, documentId, request }))
    .digest('hex');
}

function sectionHashOf(node: DocNode): string | undefined {
  const value = node.metadata.sectionHash;
  return typeof value === 'string' ? value : undefined;
}

function lineBreak(markdown: string): '\n' | '\r\n' {
  return markdown.includes('\r\n') ? '\r\n' : '\n';
}

function ensureTrailingBreak(value: string, newline: string): string {
  const normalized = value.replace(/\r\n?|\n/g, newline);
  return normalized.endsWith(newline) ? normalized : `${normalized}${newline}`;
}

function uniqueSectionByHash(sections: readonly MarkdownSection[], hash: string): MarkdownSection {
  const matches = sections.filter(section => section.hash === hash);
  if (matches.length !== 1) throw new Error('Section was not uniquely matched. Reload before saving.');
  return matches[0];
}

function addedSection(
  before: readonly MarkdownSection[],
  after: readonly MarkdownSection[],
  heading?: string,
): MarkdownSection {
  const beforeCounts = new Map<string, number>();
  for (const section of before) beforeCounts.set(section.hash, (beforeCounts.get(section.hash) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const section of after) {
    const occurrence = (seen.get(section.hash) ?? 0) + 1;
    seen.set(section.hash, occurrence);
    if ((!heading || section.heading === heading) && occurrence > (beforeCounts.get(section.hash) ?? 0)) return section;
  }
  throw new Error('Mutation did not produce one identifiable new section.');
}

function assignNodeType(
  sidecar: DocumentPresentationSidecar,
  sectionHash: string,
  nodeType: Exclude<DocNode['type'], 'document' | 'track'>,
  previousHash?: string,
  nextSections: readonly MarkdownSection[] = [],
): DocumentPresentationSidecar {
  const nodeTypes = { ...sidecar.nodeTypes, [sectionHash]: nodeType };
  if (previousHash && previousHash !== sectionHash && !nextSections.some(section => section.hash === previousHash)) {
    delete nodeTypes[previousHash];
  }
  return { ...sidecar, nodeTypes };
}

function subtreeEnd(sections: readonly MarkdownSection[], section: MarkdownSection, markdownLength: number): number {
  const index = sections.findIndex(candidate => candidate.startOffset === section.startOffset);
  if (index < 0) throw new Error('Section boundary is no longer available.');
  for (let cursor = index + 1; cursor < sections.length; cursor += 1) {
    if (sections[cursor].depth <= section.depth) return sections[cursor].startOffset;
  }
  return markdownLength;
}

function parentSectionOf(
  sections: readonly MarkdownSection[],
  section: MarkdownSection,
): MarkdownSection | undefined {
  const index = sections.findIndex(candidate => candidate.startOffset === section.startOffset);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (sections[cursor].depth < section.depth) return sections[cursor];
  }
  return undefined;
}

function directChildOf(
  sections: readonly MarkdownSection[],
  child: MarkdownSection,
  parent: MarkdownSection,
): boolean {
  return parentSectionOf(sections, child)?.hash === parent.hash;
}

function relevelSubtree(block: string, delta: number): string {
  if (delta === 0) return block;
  return block.replace(/^(#{1,6})(?=\s)/gmu, hashes => {
    const depth = hashes.length + delta;
    if (depth < 1 || depth > 6) throw new Error('Moved subtree would exceed Markdown heading depth limits.');
    return '#'.repeat(depth);
  });
}

function replaceSectionBody(
  markdown: string,
  section: MarkdownSection,
  title: string,
  content: string,
): string {
  const separator = markdown.slice(section.headingEndOffset, section.bodyStartOffset)
    || (content ? lineBreak(markdown) : '');
  const heading = section.heading === title
    ? markdown.slice(section.startOffset, section.headingEndOffset)
    : `${'#'.repeat(section.depth)} ${title}`;
  const suffix = markdown.slice(section.endOffset);
  let replacement = `${heading}${separator}${content}`;
  if (suffix && !/[\r\n]$/u.test(replacement) && !/^[\r\n]/u.test(suffix)) {
    replacement += lineBreak(markdown);
  }
  return markdown.slice(0, section.startOffset) + replacement + suffix;
}

function nodeByHash(document: DocCanvas, hash: string): DocNode {
  const matches = document.nodes.filter(node => sectionHashOf(node) === hash);
  if (matches.length !== 1) throw new Error('Node section was not uniquely matched. Reload before saving.');
  return matches[0];
}

function assertNodeIdentity(document: DocCanvas, nodeId: string, hash: string): DocNode {
  const node = document.nodes.find(candidate => candidate.id === nodeId);
  if (!node || sectionHashOf(node) !== hash) throw new Error('Node identity is stale. Reload before saving.');
  return node;
}

function regionForModule(document: DocCanvas, moduleId: string) {
  const model = buildArchitectureViewModel(document);
  const region = model.regions.find(candidate => candidate.id === moduleId && candidate.kind === 'room');
  if (!region) throw new Error('Module is no longer available. Reload before saving.');
  return { model, region };
}

function assertNodeInModule(document: DocCanvas, moduleId: string, nodeId: string): void {
  const { region } = regionForModule(document, moduleId);
  if (!region.nodeIds.includes(nodeId)) throw new Error('Node cannot move outside its module.');
}

function moduleHeadingSection(document: DocCanvas, moduleId: string, sections: readonly MarkdownSection[]): MarkdownSection {
  const { region } = regionForModule(document, moduleId);
  const headingNode = region.headingNodeIds
    .map(id => document.nodes.find(node => node.id === id))
    .find(Boolean);
  const hash = headingNode ? sectionHashOf(headingNode) : undefined;
  if (!hash) throw new Error('Module heading is not editable.');
  return uniqueSectionByHash(sections, hash);
}

function insertNode(markdown: string, document: DocCanvas, operation: Extract<DocumentMutation, { type: 'insertNode' }>): string {
  const sections = extractMarkdownSections(markdown);
  const moduleSection = moduleHeadingSection(document, operation.moduleId, sections);
  const parentSection = operation.parentSectionHash
    ? uniqueSectionByHash(sections, operation.parentSectionHash)
    : moduleSection;
  if (operation.parentSectionHash) {
    const parentNode = nodeByHash(document, operation.parentSectionHash);
    assertNodeInModule(document, operation.moduleId, parentNode.id);
  }
  let offset = parentSection.endOffset;
  if (operation.afterSectionHash) {
    const afterNode = nodeByHash(document, operation.afterSectionHash);
    assertNodeInModule(document, operation.moduleId, afterNode.id);
    const afterSection = uniqueSectionByHash(sections, operation.afterSectionHash);
    if (!directChildOf(sections, afterSection, parentSection)) {
      throw new Error('Insert anchor must be a direct child of the selected parent.');
    }
    offset = subtreeEnd(sections, afterSection, markdown.length);
  }
  const newline = lineBreak(markdown);
  const depth = parentSection.depth + 1;
  if (depth > 6) throw new Error('New node would exceed Markdown heading depth limits.');
  const content = ensureTrailingBreak(operation.content, newline);
  const block = `${'#'.repeat(depth)} ${operation.title}${newline}${newline}${content}${newline}`;
  const prefix = offset > 0 && !markdown.slice(0, offset).endsWith(newline) ? newline : '';
  return markdown.slice(0, offset) + prefix + block + markdown.slice(offset);
}

function duplicateNode(markdown: string, document: DocCanvas, operation: Extract<DocumentMutation, { type: 'duplicateNode' }>): string {
  const node = assertNodeIdentity(document, operation.nodeId, operation.sectionHash);
  assertNodeInModule(document, operation.moduleId, node.id);
  if (node.level <= 2) throw new Error('Top-level modules cannot be duplicated.');
  const sections = extractMarkdownSections(markdown);
  const section = uniqueSectionByHash(sections, operation.sectionHash);
  const end = subtreeEnd(sections, section, markdown.length);
  const existing = new Set(sections.map(candidate => candidate.heading));
  let title = `${node.title} 副本`;
  let suffix = 2;
  while (existing.has(title)) title = `${node.title} 副本 ${suffix++}`;
  const raw = markdown.slice(section.startOffset, end);
  const renamed = raw.replace(markdown.slice(section.startOffset, section.headingEndOffset), `${'#'.repeat(section.depth)} ${title}`);
  const newline = lineBreak(markdown);
  return markdown.slice(0, end) + (markdown.slice(0, end).endsWith(newline) ? '' : newline) + renamed + markdown.slice(end);
}

function moveNode(markdown: string, document: DocCanvas, operation: Extract<DocumentMutation, { type: 'moveNode' }>): string {
  const node = assertNodeIdentity(document, operation.nodeId, operation.sectionHash);
  assertNodeInModule(document, operation.moduleId, node.id);
  if (node.level <= 2) throw new Error('Top-level modules use the module order field.');
  if (operation.afterSectionHash === operation.sectionHash) return markdown;
  const sections = extractMarkdownSections(markdown);
  const source = uniqueSectionByHash(sections, operation.sectionHash);
  const sourceParent = parentSectionOf(sections, source);
  if (!sourceParent) throw new Error('Node parent is no longer available. Reload before saving.');
  const targetParent = operation.parentSectionHash
    ? uniqueSectionByHash(sections, operation.parentSectionHash)
    : sourceParent;
  if (operation.parentSectionHash) {
    const parentNode = nodeByHash(document, operation.parentSectionHash);
    assertNodeInModule(document, operation.moduleId, parentNode.id);
  }
  const sourceEnd = subtreeEnd(sections, source, markdown.length);
  if (targetParent.startOffset >= source.startOffset && targetParent.startOffset < sourceEnd) {
    throw new Error('A node cannot move under its own descendant.');
  }
  if (operation.afterSectionHash) {
    const target = nodeByHash(document, operation.afterSectionHash);
    assertNodeInModule(document, operation.moduleId, target.id);
    const targetSection = uniqueSectionByHash(sections, operation.afterSectionHash);
    if (targetSection.startOffset >= source.startOffset && targetSection.startOffset < sourceEnd) {
      throw new Error('A node cannot move relative to its own descendant.');
    }
    if (!directChildOf(sections, targetSection, targetParent)) {
      throw new Error('Move anchor must be a direct child of the selected parent.');
    }
  }
  const block = relevelSubtree(
    markdown.slice(source.startOffset, sourceEnd),
    targetParent.depth + 1 - source.depth,
  );
  const without = markdown.slice(0, source.startOffset) + markdown.slice(sourceEnd);
  const nextDocument = parseMarkdownToGraph(without, document.id, document.documentPath);
  const nextSections = extractMarkdownSections(without);
  let insertAt: number;
  if (operation.afterSectionHash) {
    const targetNode = nodeByHash(nextDocument, operation.afterSectionHash);
    assertNodeInModule(nextDocument, operation.moduleId, targetNode.id);
    const target = uniqueSectionByHash(nextSections, operation.afterSectionHash);
    insertAt = subtreeEnd(nextSections, target, without.length);
  } else {
    const nextParent = uniqueSectionByHash(nextSections, targetParent.hash);
    insertAt = nextParent.endOffset;
  }
  const newline = lineBreak(without);
  const prefix = insertAt > 0 && !without.slice(0, insertAt).endsWith(newline) ? newline : '';
  return without.slice(0, insertAt) + prefix + block + without.slice(insertAt);
}

function applyMutation(
  markdown: string,
  sidecar: DocumentPresentationSidecar,
  documentId: string,
  filePath: string,
  operation: DocumentMutation,
): { markdown: string; sidecar: DocumentPresentationSidecar } {
  const parsed = parseMarkdownToGraph(markdown, documentId, filePath);
  if (operation.type === 'updateModule') {
    regionForModule(parsed, operation.moduleId);
    return {
      markdown,
      sidecar: {
        ...sidecar,
        modules: {
          ...sidecar.modules,
          [operation.moduleId]: {
            ...sidecar.modules[operation.moduleId],
            ...operation.profile,
          },
        },
      },
    };
  }
  if (operation.type === 'insertNode') {
    const nextMarkdown = insertNode(markdown, parsed, operation);
    const nextSections = extractMarkdownSections(nextMarkdown);
    const inserted = addedSection(extractMarkdownSections(markdown), nextSections, operation.title);
    return {
      markdown: nextMarkdown,
      sidecar: assignNodeType(sidecar, inserted.hash, operation.nodeType),
    };
  }
  if (operation.type === 'duplicateNode') {
    const source = assertNodeIdentity(parsed, operation.nodeId, operation.sectionHash);
    const nextMarkdown = duplicateNode(markdown, parsed, operation);
    const nextSections = extractMarkdownSections(nextMarkdown);
    const duplicated = addedSection(extractMarkdownSections(markdown), nextSections);
    const sourceType = sidecar.nodeTypes[operation.sectionHash]
      ?? (source.type === 'document' || source.type === 'track' ? 'subsection' : source.type);
    return {
      markdown: nextMarkdown,
      sidecar: assignNodeType(sidecar, duplicated.hash, sourceType),
    };
  }
  if (operation.type === 'moveNode') {
    return { markdown: moveNode(markdown, parsed, operation), sidecar };
  }
  if (operation.type === 'softDeleteNode') {
    const node = assertNodeIdentity(parsed, operation.nodeId, operation.sectionHash);
    assertNodeInModule(parsed, operation.moduleId, node.id);
    if (node.level <= 2) throw new Error('Top-level modules cannot be deleted.');
    return {
      markdown,
      sidecar: {
        ...sidecar,
        deletedSectionHashes: [...new Set([...sidecar.deletedSectionHashes, operation.sectionHash])],
      },
    };
  }

  const node = assertNodeIdentity(parsed, operation.nodeId, operation.sectionHash);
  if (node.level <= 2) throw new Error('Use module editing for top-level module fields.');
  const sections = extractMarkdownSections(markdown);
  const section = uniqueSectionByHash(sections, operation.sectionHash);
  const nextMarkdown = replaceSectionBody(markdown, section, operation.title, operation.content);
  const nextSections = extractMarkdownSections(nextMarkdown);
  const sectionIndex = sections.findIndex(candidate => candidate.startOffset === section.startOffset);
  const nextSection = nextSections[sectionIndex];
  if (!nextSection) throw new Error('Updated section could not be re-identified.');
  return {
    markdown: nextMarkdown,
    sidecar: assignNodeType(sidecar, nextSection.hash, operation.nodeType, operation.sectionHash, nextSections),
  };
}

function transactionPath(documentId: string): string {
  return projectPath(join(TRANSACTION_DIR, `${documentId}.json`));
}

function revisionDocumentPath(directory: string): string {
  return join(directory, 'document.md');
}

function revisionPresentationPath(directory: string): string {
  return join(directory, 'presentation.json');
}

function createSnapshot(
  documentId: string,
  markdown: string,
  sidecar: DocumentPresentationSidecar,
  mutationType: string,
): { directory: string; manifest: RevisionManifest } {
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/[-:.TZ]/g, '')}-${randomUUID()}`;
  const root = projectPath(join(REVISION_DIR, documentId));
  mkdirSync(root, { recursive: true, mode: 0o750 });
  const directory = join(root, id);
  mkdirSync(directory, { recursive: false, mode: 0o750 });
  const presentation = `${JSON.stringify(sidecar, null, 2)}\n`;
  atomicWriteText(revisionDocumentPath(directory), markdown);
  atomicWriteText(revisionPresentationPath(directory), presentation);
  const manifest: RevisionManifest = {
    schemaVersion: 1,
    id,
    documentId,
    revision: sidecar.revision,
    createdAt,
    documentHash: documentContentHash(markdown),
    presentationHash: documentContentHash(presentation),
    mutationType,
  };
  atomicWriteJson(join(directory, 'manifest.json'), manifest);
  return { directory, manifest };
}

function restoreSnapshot(
  snapshotDir: string,
  filePath: string,
  sidecarPath: string,
  hadPresentation: boolean,
): void {
  atomicWriteText(filePath, readFileSync(revisionDocumentPath(snapshotDir), 'utf8'));
  if (hadPresentation) {
    atomicWriteText(sidecarPath, readFileSync(revisionPresentationPath(snapshotDir), 'utf8'));
  } else {
    rmSync(sidecarPath, { force: true });
  }
}

function recoverIncompleteTransaction(
  documentId: string,
  filePath: string,
  sidecarPath: string,
): void {
  const journalPath = transactionPath(documentId);
  if (!existsSync(journalPath)) return;
  const journal = TransactionSchema.parse(JSON.parse(readFileSync(journalPath, 'utf8')));
  const markdown = readFileSync(filePath, 'utf8');
  const currentHash = documentContentHash(markdown);
  let currentRevision = 0;
  if (existsSync(sidecarPath)) {
    currentRevision = parsePresentationSidecar(JSON.parse(readFileSync(sidecarPath, 'utf8'))).revision;
  }
  if (
    (currentHash === journal.afterDocumentHash && currentRevision === journal.afterRevision)
    || (currentHash === journal.beforeDocumentHash && currentRevision === journal.beforeRevision)
  ) {
    rmSync(journalPath, { force: true });
    return;
  }
  restoreSnapshot(journal.snapshotDir, filePath, sidecarPath, journal.hadPresentation);
  rmSync(journalPath, { force: true });
}

function appendAudit(documentId: string, entry: Record<string, unknown>): void {
  const filePath = projectPath(join(AUDIT_DIR, `${documentId}.jsonl`));
  mkdirSync(projectPath(AUDIT_DIR), { recursive: true, mode: 0o750 });
  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o640 });
}

function latestAuditEntry(documentId: string): MutationAuditEntry | undefined {
  const filePath = projectPath(join(AUDIT_DIR, `${documentId}.jsonl`));
  if (!existsSync(filePath)) return undefined;
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/u).filter(Boolean);
  if (lines.length === 0) return undefined;
  return AuditEntrySchema.parse(JSON.parse(lines[lines.length - 1]));
}

function replayedMutationResult(
  documentId: string,
  filePath: string,
  markdown: string,
  sidecar: DocumentPresentationSidecar,
  fingerprint: string,
): MutationResult | undefined {
  const audit = latestAuditEntry(documentId);
  if (
    !audit
    || audit.requestHash !== fingerprint
    || audit.revision !== sidecar.revision
    || audit.documentHash !== documentContentHash(markdown)
  ) return undefined;
  const parsed = parseMarkdownToGraph(markdown, documentId, filePath);
  return {
    document: applyDocumentSidecar(parsed, sidecar),
    presentation: sidecar,
    revision: sidecar.revision,
    mutationId: audit.mutationId,
  };
}

function pruneRevisions(documentId: string, now = Date.now()): void {
  const root = projectPath(join(REVISION_DIR, documentId));
  if (!existsSync(root)) return;
  const directories = readdirSync(root)
    .map(name => ({ name, path: join(root, name), stat: statSync(join(root, name)) }))
    .filter(entry => entry.stat.isDirectory())
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);
  const cutoff = now - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  directories.forEach((entry, index) => {
    if (index >= RETAIN_MINIMUM && entry.stat.mtimeMs < cutoff) rmSync(entry.path, { recursive: true, force: true });
  });
}

function commitTransaction(input: {
  documentId: string;
  filePath: string;
  previousMarkdown: string;
  previousSidecar: DocumentPresentationSidecar;
  nextMarkdown: string;
  nextSidecar: DocumentPresentationSidecar;
  mutationId: string;
  mutationType: string;
  requestHash: string;
  baseRevision: number;
  baseDocumentHash: string;
  hadPresentation: boolean;
  snapshotDir: string;
}): void {
  const sidecarPath = presentationSidecarPath(input.documentId);
  const journalPath = transactionPath(input.documentId);
  atomicWriteJson(journalPath, {
    schemaVersion: 1,
    documentId: input.documentId,
    snapshotDir: input.snapshotDir,
    hadPresentation: input.hadPresentation,
    beforeDocumentHash: documentContentHash(input.previousMarkdown),
    beforeRevision: input.previousSidecar.revision,
    afterDocumentHash: documentContentHash(input.nextMarkdown),
    afterRevision: input.nextSidecar.revision,
  });
  try {
    atomicWriteJson(sidecarPath, input.nextSidecar);
    atomicWriteText(input.filePath, input.nextMarkdown);
    appendAudit(input.documentId, {
      mutationId: input.mutationId,
      mutationType: input.mutationType,
      revision: input.nextSidecar.revision,
      documentHash: input.nextSidecar.documentHash,
      committedAt: input.nextSidecar.updatedAt,
      requestHash: input.requestHash,
      baseRevision: input.baseRevision,
      baseDocumentHash: input.baseDocumentHash,
    });
    rmSync(journalPath, { force: true });
  } catch (error) {
    restoreSnapshot(input.snapshotDir, input.filePath, sidecarPath, input.hadPresentation);
    rmSync(journalPath, { force: true });
    throw error;
  }
}

export async function mutateDocument(
  documentId: string,
  request: DocumentMutationRequest,
): Promise<MutationResult> {
  const entry = assertKnownDocument(documentId);
  const filePath = projectPath(entry.path);
  if (!existsSync(filePath)) throw new Error('Document file not found.');
  const sidecarPath = presentationSidecarPath(documentId);
  const fingerprint = requestHash(documentId, request);

  return withFileLock(`${filePath}.lock`, () => {
    recoverIncompleteTransaction(documentId, filePath, sidecarPath);
    const markdown = readFileSync(filePath, 'utf8');
    const hash = documentContentHash(markdown);
    const sidecar = readPresentationSidecar(documentId, markdown);
    if (request.baseDocumentHash !== hash || request.baseRevision !== sidecar.revision) {
      const replayed = replayedMutationResult(documentId, filePath, markdown, sidecar, fingerprint);
      if (replayed) return replayed;
      throw new Error('Document revision conflict. Reload before saving.');
    }

    const applied = applyMutation(markdown, sidecar, documentId, filePath, request.operation);
    const nextHash = documentContentHash(applied.markdown);
    const updatedAt = new Date().toISOString();
    const nextSidecar = parsePresentationSidecar({
      ...applied.sidecar,
      revision: sidecar.revision + 1,
      documentHash: nextHash,
      updatedAt,
    });
    const nextParsed = parseMarkdownToGraph(applied.markdown, documentId, filePath);
    const nextDocument = applyDocumentSidecar(nextParsed, nextSidecar);
    if (nextDocument.nodes.length === 0) throw new Error('Mutation produced an empty document graph.');
    if (buildArchitectureViewModel(nextDocument).regions.length === 0) {
      throw new Error('Mutation produced no renderable factory regions.');
    }

    const hadPresentation = existsSync(sidecarPath);
    const mutationId = randomUUID();
    const snapshot = createSnapshot(documentId, markdown, sidecar, request.operation.type);
    commitTransaction({
      documentId,
      filePath,
      previousMarkdown: markdown,
      previousSidecar: sidecar,
      nextMarkdown: applied.markdown,
      nextSidecar,
      mutationId,
      mutationType: request.operation.type,
      requestHash: fingerprint,
      baseRevision: request.baseRevision,
      baseDocumentHash: request.baseDocumentHash,
      hadPresentation,
      snapshotDir: snapshot.directory,
    });
    pruneRevisions(documentId);
    return {
      document: nextDocument,
      presentation: nextSidecar,
      revision: nextSidecar.revision,
      mutationId,
    };
  });
}

export function listDocumentRevisions(documentId: string): RevisionSummary[] {
  assertKnownDocument(documentId);
  const root = projectPath(join(REVISION_DIR, documentId));
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map(name => join(root, name, 'manifest.json'))
    .filter(existsSync)
    .map(filePath => JSON.parse(readFileSync(filePath, 'utf8')) as RevisionManifest)
    .filter(manifest => manifest.schemaVersion === 1 && manifest.documentId === documentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(({ id, revision, createdAt, documentHash, mutationType }) => ({
      id,
      documentId,
      revision,
      createdAt,
      documentHash,
      mutationType,
    }));
}

export async function restoreDocumentRevision(
  documentId: string,
  revisionId: string,
  baseRevision: number,
  baseDocumentHash: string,
): Promise<MutationResult> {
  const entry = assertKnownDocument(documentId);
  const filePath = projectPath(entry.path);
  const sidecarPath = presentationSidecarPath(documentId);
  const revisionDir = projectPath(join(REVISION_DIR, documentId, revisionId));
  if (!existsSync(join(revisionDir, 'manifest.json'))) throw new Error('Revision not found.');
  const fingerprint = requestHash(documentId, {
    type: 'restoreRevision',
    revisionId,
    baseRevision,
    baseDocumentHash,
  });

  return withFileLock(`${filePath}.lock`, () => {
    recoverIncompleteTransaction(documentId, filePath, sidecarPath);
    const markdown = readFileSync(filePath, 'utf8');
    const sidecar = readPresentationSidecar(documentId, markdown);
    if (sidecar.revision !== baseRevision || documentContentHash(markdown) !== baseDocumentHash) {
      const replayed = replayedMutationResult(documentId, filePath, markdown, sidecar, fingerprint);
      if (replayed) return replayed;
      throw new Error('Document revision conflict. Reload before restoring.');
    }
    const restoredMarkdown = readFileSync(revisionDocumentPath(revisionDir), 'utf8');
    const restoredSidecar = parsePresentationSidecar(JSON.parse(readFileSync(revisionPresentationPath(revisionDir), 'utf8')));
    const nextSidecar = parsePresentationSidecar({
      ...restoredSidecar,
      revision: sidecar.revision + 1,
      documentHash: documentContentHash(restoredMarkdown),
      updatedAt: new Date().toISOString(),
    });
    const parsed = parseMarkdownToGraph(restoredMarkdown, documentId, filePath);
    if (parsed.nodes.length === 0) throw new Error('Revision contains no parseable document nodes.');
    const hadPresentation = existsSync(sidecarPath);
    const mutationId = randomUUID();
    const snapshot = createSnapshot(documentId, markdown, sidecar, 'restoreRevision');
    commitTransaction({
      documentId,
      filePath,
      previousMarkdown: markdown,
      previousSidecar: sidecar,
      nextMarkdown: restoredMarkdown,
      nextSidecar,
      mutationId,
      mutationType: 'restoreRevision',
      requestHash: fingerprint,
      baseRevision,
      baseDocumentHash,
      hadPresentation,
      snapshotDir: snapshot.directory,
    });
    pruneRevisions(documentId);
    return {
      document: applyDocumentSidecar(parsed, nextSidecar),
      presentation: nextSidecar,
      revision: nextSidecar.revision,
      mutationId,
    };
  });
}
