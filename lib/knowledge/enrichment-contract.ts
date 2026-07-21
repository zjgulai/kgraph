import {
  KnowledgeFormPrimarySchema,
  KnowledgeSubformSchema,
  validateKnowledgeObject,
  type KnowledgeObject,
} from '../../../scripts/lib/knowledge-object-contract';
import { z } from 'zod';
import type { CaptureRecord } from '../server/knowledge-capture-store';

const ObjectTypeSchema = z.enum([
  'problem', 'claim', 'evidence', 'pattern', 'decision', 'technology', 'tool', 'tip',
  'failure_mode', 'artifact', 'quality_gate', 'capability_gene', 'commercial_hypothesis',
  'experiment', 'feedback', 'revision',
]);

export const DOMAIN_REF_PATTERN_SOURCE = '^[a-zA-Z0-9][a-zA-Z0-9._-]+$' as const;
const DomainRefSchema = z.string().regex(new RegExp(DOMAIN_REF_PATTERN_SOURCE, 'u'));
export type SourceLanguage = 'zh' | 'en' | 'mixed' | 'und';

export const EvidenceLocatorSchema = z.object({
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
}).strict().refine(value => value.endLine >= value.startLine, {
  message: 'endLine must be greater than or equal to startLine',
});

export const EnrichmentClassificationSchema = z.object({
  objectType: ObjectTypeSchema,
  knowledgeForm: z.object({
    primary: KnowledgeFormPrimarySchema,
    subform: KnowledgeSubformSchema,
  }).strict(),
  domainRefs: z.array(DomainRefSchema).min(1).max(8),
  evidenceLocators: z.array(EvidenceLocatorSchema).min(1).max(8),
}).strict();

export const EnrichmentDraftSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-draft-v1'),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1_200),
  keyPoints: z.array(z.object({
    text: z.string().trim().min(1).max(400),
    evidenceLocators: z.array(EvidenceLocatorSchema).min(1).max(6),
  }).strict()).min(1).max(8),
  classification: EnrichmentClassificationSchema,
  abstentions: z.array(z.string().trim().min(1).max(240)).max(8),
}).strict().superRefine((draft, context) => {
  const allowedSubforms: Record<z.infer<typeof KnowledgeFormPrimarySchema>, ReadonlySet<string>> = {
    fact: new Set(['definition', 'observation', 'measurement', 'constraint']),
    procedure: new Set(['checklist', 'workflow', 'technique', 'playbook']),
    framework: new Set(['model', 'taxonomy', 'decision_framework', 'architecture']),
    metacognitive: new Set(['heuristic', 'mental_model', 'reflection', 'learning_strategy']),
  };
  if (!allowedSubforms[draft.classification.knowledgeForm.primary].has(draft.classification.knowledgeForm.subform)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['classification', 'knowledgeForm', 'subform'],
      message: 'subform is incompatible with primary knowledge form',
    });
  }
  if (new Set(draft.classification.domainRefs).size !== draft.classification.domainRefs.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['classification', 'domainRefs'],
      message: 'domainRefs must be unique',
    });
  }
});

export type EnrichmentDraft = z.infer<typeof EnrichmentDraftSchema>;

export interface EnrichmentCandidateContext {
  enrichmentId: string;
  enrichedAt: string;
  providerId: string;
  modelId: string;
  promptVersion: string;
}

export function validateDraftAgainstSource(draft: EnrichmentDraft, source: string): void {
  const lineCount = source.replace(/\r\n?/gu, '\n').split('\n').length;
  const locators = [
    ...draft.keyPoints.flatMap(point => point.evidenceLocators),
    ...draft.classification.evidenceLocators,
  ];
  const invalid = locators.find(locator => locator.startLine > lineCount || locator.endLine > lineCount);
  if (invalid) {
    throw new Error(`ENRICHMENT_EVIDENCE_LOCATOR_INVALID: ${invalid.startLine}-${invalid.endLine} exceeds ${lineCount} lines`);
  }
}

function scriptCounts(value: string): { han: number; latin: number } {
  return {
    han: value.match(/\p{Script=Han}/gu)?.length ?? 0,
    latin: value.match(/\p{Script=Latin}/gu)?.length ?? 0,
  };
}

export function detectSourceLanguage(value: string): SourceLanguage {
  const { han, latin } = scriptCounts(value);
  if (han === 0 && latin === 0) return 'und';
  if (han === 0) return 'en';
  if (latin === 0) return 'zh';
  const hanShare = han / (han + latin);
  if (han >= 8 && hanShare >= 0.2) return 'zh';
  if (latin >= 8 && hanShare < 0.05) return 'en';
  return 'mixed';
}

function assertAllowedDomainRefs(domainRefs: readonly string[]): string[] {
  const normalized = [...domainRefs].sort((left, right) => left.localeCompare(right));
  if (normalized.length < 1 || normalized.length > 8
    || new Set(normalized).size !== normalized.length
    || normalized.some(value => !DomainRefSchema.safeParse(value).success)) {
    throw new Error('ENRICHMENT_DOMAIN_CONTRACT_INVALID: allowed domain refs must be 1-8 unique stable identifiers');
  }
  return normalized;
}

export function validateDraftAgainstGovernance(
  draft: EnrichmentDraft,
  source: string,
  allowedDomainRefs: readonly string[],
): void {
  const sourceLanguage = detectSourceLanguage(source);
  const outputLanguage = detectSourceLanguage([
    draft.title,
    draft.summary,
    ...draft.keyPoints.map(point => point.text),
    ...draft.abstentions,
  ].join('\n'));
  if ((sourceLanguage === 'zh' || sourceLanguage === 'en') && outputLanguage !== sourceLanguage) {
    throw new Error(`ENRICHMENT_SOURCE_LANGUAGE_MISMATCH: expected ${sourceLanguage}, received ${outputLanguage}`);
  }
  const allowed = assertAllowedDomainRefs(allowedDomainRefs);
  const actual = [...draft.classification.domainRefs].sort((left, right) => left.localeCompare(right));
  if (actual.length !== allowed.length || actual.some((value, index) => value !== allowed[index])) {
    throw new Error(`ENRICHMENT_DOMAIN_TAXONOMY_MISMATCH: expected ${allowed.join(',')}, received ${actual.join(',')}`);
  }
}

export function buildEnrichedKnowledgeObject(
  capture: CaptureRecord,
  draft: EnrichmentDraft,
  context: EnrichmentCandidateContext,
): KnowledgeObject {
  const body = [
    draft.summary,
    '',
    '## Key points',
    ...draft.keyPoints.map(point => `- ${point.text} [lines ${point.evidenceLocators.map(locator => (
      locator.startLine === locator.endLine ? locator.startLine : `${locator.startLine}-${locator.endLine}`
    )).join(', ')}]`),
    ...(draft.abstentions.length > 0 ? ['', '## Abstentions', ...draft.abstentions.map(item => `- ${item}`)] : []),
    '',
    '## Enrichment metadata',
    'generation_mode: provider_structured',
    `provider_id: ${context.providerId}`,
    `model_id: ${context.modelId}`,
    `prompt_version: ${context.promptVersion}`,
    `enrichment_id: ${context.enrichmentId}`,
    'verification_status: human_review_required',
  ].join('\n');
  const knowledgeObject: KnowledgeObject = {
    ...capture.candidate,
    object_type: draft.classification.objectType,
    title: draft.title,
    body,
    knowledge_form: {
      primary: draft.classification.knowledgeForm.primary,
      subforms: [draft.classification.knowledgeForm.subform],
    },
    domain_refs: [...draft.classification.domainRefs],
    asset_maturity: 'captured',
    scope: 'candidate',
    ...(draft.classification.knowledgeForm.primary === 'fact'
      ? { valid_time: capture.candidate.valid_time ?? { from: null, until: null } }
      : { valid_time: undefined }),
    observed_at: context.enrichedAt,
    evidence_grade: 'llm_distilled_candidate',
    promotion_state: 'human_review_required',
    confidence: undefined,
    created_by: { actor_type: 'agent', actor_id: `enrichment.${context.providerId}.${context.modelId}` },
    revision: 1,
  };
  const normalized = Object.fromEntries(Object.entries(knowledgeObject).filter(([, value]) => value !== undefined));
  const validation = validateKnowledgeObject(normalized);
  if (!validation.success || !validation.knowledgeObject) {
    throw new Error(`ENRICHMENT_CANDIDATE_INVALID: ${validation.errors.map(error => `${error.code} ${error.path}: ${error.message}`).join('; ')}`);
  }
  return validation.knowledgeObject;
}

export const ENRICHMENT_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'title', 'summary', 'keyPoints', 'classification', 'abstentions'],
  properties: {
    schemaVersion: { const: 'doccanvas-enrichment-draft-v1' },
    title: { type: 'string', minLength: 1, maxLength: 160 },
    summary: { type: 'string', minLength: 1, maxLength: 1200 },
    keyPoints: {
      type: 'array', minItems: 1, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['text', 'evidenceLocators'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 400 },
          evidenceLocators: { type: 'array', minItems: 1, maxItems: 6, items: { $ref: '#/$defs/locator' } },
        },
      },
    },
    classification: {
      type: 'object', additionalProperties: false,
      required: ['objectType', 'knowledgeForm', 'domainRefs', 'evidenceLocators'],
      properties: {
        objectType: { enum: ObjectTypeSchema.options },
        knowledgeForm: {
          type: 'object', additionalProperties: false, required: ['primary', 'subform'],
          properties: { primary: { enum: KnowledgeFormPrimarySchema.options }, subform: { enum: KnowledgeSubformSchema.options } },
        },
        domainRefs: {
          type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
          items: { type: 'string', pattern: DOMAIN_REF_PATTERN_SOURCE },
        },
        evidenceLocators: { type: 'array', minItems: 1, maxItems: 8, items: { $ref: '#/$defs/locator' } },
      },
    },
    abstentions: { type: 'array', maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 240 } },
  },
  $defs: {
    locator: {
      type: 'object', additionalProperties: false, required: ['startLine', 'endLine'],
      properties: { startLine: { type: 'integer', minimum: 1 }, endLine: { type: 'integer', minimum: 1 } },
    },
  },
} as const;

export type EnrichmentOutputJsonSchema = Readonly<Record<string, unknown>>;

export function createEnrichmentOutputJsonSchema(allowedDomainRefs: readonly string[]): EnrichmentOutputJsonSchema {
  const allowed = assertAllowedDomainRefs(allowedDomainRefs);
  const classification = ENRICHMENT_OUTPUT_JSON_SCHEMA.properties.classification;
  return {
    ...ENRICHMENT_OUTPUT_JSON_SCHEMA,
    properties: {
      ...ENRICHMENT_OUTPUT_JSON_SCHEMA.properties,
      classification: {
        ...classification,
        properties: {
          ...classification.properties,
          domainRefs: {
            ...classification.properties.domainRefs,
            minItems: allowed.length,
            maxItems: allowed.length,
            items: {
              ...classification.properties.domainRefs.items,
              enum: allowed,
            },
          },
        },
      },
    },
  };
}
