import { createHash } from 'crypto';
import {
  validateKnowledgeObject,
  type KnowledgeObject,
} from '../../../scripts/lib/knowledge-object-contract';

export interface CaptureRequest {
  source:
    | { kind: 'url'; sourceUri: string; mediaType: 'text/markdown' | 'text/plain'; content: string }
    | { kind: 'file'; fileName: string; mediaType: 'text/markdown' | 'text/plain'; content: string };
  title?: string;
  objectType: KnowledgeObject['object_type'];
  knowledgeForm: {
    primary: KnowledgeObject['knowledge_form']['primary'];
    subform: KnowledgeObject['knowledge_form']['subforms'][number];
  };
  domainRef: string;
}

export interface ExtractiveDraftContext {
  capturedAt: string;
  sourceHash: string;
  sourceLocator: string;
  captureId: string;
}

function plainText(value: string): string {
  return value
    .replace(/^#{1,6}\s+/u, '')
    .replace(/^[-*+]\s+/u, '')
    .replace(/^\d+[.)]\s+/u, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`~]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function paragraphs(content: string): string[] {
  return content
    .replace(/\r\n?/gu, '\n')
    .split(/\n\s*\n/gu)
    .map(value => value.trim())
    .filter(Boolean);
}

function deriveTitle(request: CaptureRequest): string {
  const explicit = plainText(request.title ?? '');
  if (explicit) return explicit.slice(0, 160);
  const heading = request.source.content.match(/^#{1,3}\s+(.+)$/mu)?.[1];
  if (heading) return plainText(heading).slice(0, 160);
  const first = request.source.content.split(/\r?\n/u).find(line => plainText(line));
  return plainText(first ?? 'Untitled capture').slice(0, 160);
}

function extractSummary(content: string, title: string): string {
  const candidates = paragraphs(content)
    .filter(value => !/^#{1,6}\s/u.test(value))
    .filter(value => !/^(?:[-*+] |\d+[.)] )/u.test(value));
  return (plainText(candidates[0] ?? title) || title).slice(0, 480);
}

function extractKeyPoints(content: string, summary: string): string[] {
  const listItems = [...content.matchAll(/^\s*(?:[-*+] |\d+[.)] )(.+)$/gmu)]
    .map(match => plainText(match[1] ?? ''))
    .filter(Boolean);
  const headings = [...content.matchAll(/^#{2,4}\s+(.+)$/gmu)]
    .map(match => plainText(match[1] ?? ''))
    .filter(Boolean);
  const sentences = plainText(content)
    .split(/(?<=[。！？.!?])\s+/u)
    .map(value => value.trim())
    .filter(value => value && value !== summary);
  return [...new Set([...listItems, ...headings, ...sentences])].slice(0, 6);
}

function slug(value: string): string {
  const normalized = value.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return normalized || 'knowledge-capture';
}

function sourceUri(request: CaptureRequest, captureId: string): string {
  return request.source.kind === 'url'
    ? request.source.sourceUri
    : `capture://${captureId}/${encodeURIComponent(request.source.fileName)}`;
}

export function compileExtractiveDraft(
  request: CaptureRequest,
  context: ExtractiveDraftContext,
): KnowledgeObject {
  const title = deriveTitle(request);
  const summary = extractSummary(request.source.content, title);
  const keyPoints = extractKeyPoints(request.source.content, summary);
  const identityHash = createHash('sha256')
    .update(`${context.captureId}\n${title}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
  const sourceHash = context.sourceHash.replace(/^sha256:/u, '');
  const body = [
    summary,
    '',
    '## Extracted key points',
    ...(keyPoints.length > 0 ? keyPoints.map(point => `- ${point}`) : ['- No additional key point was deterministically extracted.']),
    '',
    '## Capture metadata',
    'generation_mode: extractive',
    'provider_call: false',
    'verification_status: human_review_required',
  ].join('\n');
  const knowledgeObject: KnowledgeObject = {
    object_id: `capture.${slug(title)}_${identityHash}`,
    object_type: request.objectType,
    title,
    body,
    knowledge_form: {
      primary: request.knowledgeForm.primary,
      subforms: [request.knowledgeForm.subform],
    },
    domain_refs: [request.domainRef],
    asset_maturity: 'captured',
    scope: 'candidate',
    ...(request.knowledgeForm.primary === 'fact'
      ? { valid_time: { from: null, until: null } }
      : {}),
    observed_at: context.capturedAt,
    source_refs: [{
      source_id: `source.${context.captureId}`,
      source_uri: sourceUri(request, context.captureId),
      locator: context.sourceLocator,
      snapshot_hash: sourceHash,
      observed_at: context.capturedAt,
      license_status: 'pending_review',
      authority_origin: request.source.kind === 'url' ? 'public_general' : 'user_generated',
    }],
    evidence_grade: 'source_registered',
    promotion_state: 'human_review_required',
    created_by: { actor_type: 'human', actor_id: 'capture.user' },
    revision: 1,
    schema_version: 'ai-product-factory-knowledge-object-v1.1',
  };
  const validation = validateKnowledgeObject(knowledgeObject);
  if (!validation.success || !validation.knowledgeObject) {
    const detail = validation.errors.map(error => `${error.code} ${error.path}: ${error.message}`).join('; ');
    throw new Error(`CAPTURE_DRAFT_INVALID: ${detail}`);
  }
  return validation.knowledgeObject;
}
