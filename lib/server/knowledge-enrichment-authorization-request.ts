import { createHash } from 'crypto';
import { isAbsolute } from 'path';
import { z } from 'zod';
import {
  inspectProviderLedgerEvidence,
  readEnrichmentJobPolicy,
  type EnrichmentJobPolicy,
} from './knowledge-enrichment-provider';
import {
  evaluatePilotReadiness,
  readCanaryReviewEvidence,
  readPilotPlan,
  type PilotReadinessGate,
} from './knowledge-enrichment-pilot';

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CAPTURE_ID = /^capture-[a-f0-9]{24}$/u;

const CanaryReceiptTemplateSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-stage-authorization-v1'),
  pilotId: z.string(),
  pilotPlanHash: z.string().regex(HASH),
  jobPolicyHash: z.string().regex(HASH),
  stage: z.literal('canary'),
  expectedReservedCalls: z.literal(0),
  maxNewCalls: z.literal(1),
  allowedCaptureIds: z.array(z.string().regex(CAPTURE_ID)).length(1),
}).strict();

const BatchReceiptTemplateSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-stage-authorization-v1'),
  pilotId: z.string(),
  pilotPlanHash: z.string().regex(HASH),
  jobPolicyHash: z.string().regex(HASH),
  stage: z.literal('batch'),
  expectedReservedCalls: z.literal(1),
  maxNewCalls: z.literal(19),
  canaryReservationId: z.string().regex(HASH),
  canaryReviewHash: z.string().regex(HASH),
  allowedCaptureIds: z.array(z.string().regex(CAPTURE_ID)).min(1).max(19),
}).strict();

export const PilotAuthorizationRequestSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-authorization-request-v2'),
  generatedAt: z.string(),
  evidenceGrade: z.literal('L2-fixture-or-dry-run'),
  state: z.enum(['not_configured', 'blocked', 'ready_for_receipt', 'receipt_present']),
  providerCall: z.literal(false),
  authorizationGranted: z.literal(false),
  executionAllowed: z.boolean(),
  requestHash: z.string().regex(HASH),
  pilotId: z.string().nullable(),
  jobId: z.string().nullable(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  policyHash: z.string().regex(HASH).nullable(),
  planHash: z.string().regex(HASH).nullable(),
  requestedStage: z.enum(['canary', 'batch']).nullable(),
  requestedCaptureIds: z.array(z.string().regex(CAPTURE_ID)).max(20),
  requestedCalls: z.number().int().min(0).max(20),
  ledgerBaseline: z.object({
    reservedCalls: z.number().int().min(0),
    providerCompletedCalls: z.number().int().min(0),
    providerFailedCalls: z.number().int().min(0),
    remainingCalls: z.number().int().min(0),
  }).strict(),
  limits: z.object({
    maxCalls: z.number().int(),
    maxInputBytes: z.number().int(),
    maxOutputTokens: z.number().int(),
    timeoutMs: z.number().int(),
  }).strict().nullable(),
  dataEgress: z.object({
    sourceText: z.literal(true),
    metadata: z.array(z.enum(['captureId', 'sourceHash'])).length(2),
    classification: z.string(),
  }).strict().nullable(),
  stageAuthorizationId: z.string().nullable(),
  stageAuthorizationHash: z.string().regex(HASH).nullable(),
  receiptTemplate: z.discriminatedUnion('stage', [CanaryReceiptTemplateSchema, BatchReceiptTemplateSchema]).nullable(),
  requiredOperatorFields: z.array(z.enum(['authorizationId', 'authorizedBy', 'authorizedAt', 'validUntil'])),
  gates: z.array(z.object({
    id: z.string(), status: z.string(), reason: z.string(),
    actual: z.union([z.number(), z.string(), z.boolean(), z.null()]),
    required: z.union([z.number(), z.string(), z.boolean()]),
  }).strict()),
  blockers: z.array(z.string()),
  nextAction: z.string(),
}).strict();

export type PilotAuthorizationRequest = z.infer<typeof PilotAuthorizationRequestSchema>;

export interface PilotAuthorizationRequestOptions {
  planFile: string;
  policyFile: string;
  apiKeyFile: string;
  ledgerFile: string;
  captureStoreDir: string;
  enrichmentStoreDir: string;
  goldStoreDir: string;
  canaryReviewFile?: string;
  goldCompletionFile?: string;
  stageAuthorizationFile?: string;
  now?: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

function hashValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function finalize(value: Omit<PilotAuthorizationRequest, 'requestHash'>): PilotAuthorizationRequest {
  return PilotAuthorizationRequestSchema.parse({ ...value, requestHash: hashValue(value) });
}

function emptyLedger() {
  return { reservedCalls: 0, providerCompletedCalls: 0, providerFailedCalls: 0, remainingCalls: 0 };
}

export function disabledPilotAuthorizationRequest(
  reason = 'pilot_plan_not_configured',
  now = new Date().toISOString(),
  state: 'not_configured' | 'blocked' = 'not_configured',
  providerId: string | null = null,
  modelId: string | null = null,
): PilotAuthorizationRequest {
  return finalize({
    schemaVersion: 'doccanvas-enrichment-authorization-request-v2', generatedAt: now,
    evidenceGrade: 'L2-fixture-or-dry-run', state,
    providerCall: false, authorizationGranted: false, executionAllowed: false,
    pilotId: null, jobId: null, providerId, modelId, policyHash: null, planHash: null,
    requestedStage: null, requestedCaptureIds: [], requestedCalls: 0,
    ledgerBaseline: emptyLedger(), limits: null, dataEgress: null,
    stageAuthorizationId: null, stageAuthorizationHash: null, receiptTemplate: null,
    requiredOperatorFields: [], gates: [], blockers: [reason], nextAction: reason,
  });
}

function configuredBlockers(gates: PilotReadinessGate[], state: PilotAuthorizationRequest['state']): string[] {
  if (state === 'receipt_present') return [];
  if (state === 'ready_for_receipt') return ['stage_authorization_required'];
  const reasons = gates.filter(item => item.status === 'blocked' || item.status === 'pending').map(item => item.reason);
  return [...new Set(reasons.length > 0 ? reasons : ['pilot_not_ready_for_stage_receipt'])];
}

function policyProjection(policy: EnrichmentJobPolicy) {
  return {
    limits: policy.limits,
    dataEgress: policy.dataEgress,
  };
}

export function buildPilotAuthorizationRequest(options: PilotAuthorizationRequestOptions): PilotAuthorizationRequest {
  const now = options.now ?? new Date().toISOString();
  const loadedPlan = readPilotPlan({ planFile: options.planFile, now });
  const loadedPolicy = readEnrichmentJobPolicy({ policyFile: options.policyFile, now });
  const report = evaluatePilotReadiness(options);
  const ledger = inspectProviderLedgerEvidence({ policyFile: options.policyFile, ledgerFile: options.ledgerFile, now });
  const requestedStage = report.executionAllowed && report.authorizedStage
    ? report.authorizedStage
    : report.readyForCanary
      ? 'canary'
      : report.readyForBatch || report.state === 'batch_in_progress'
        ? 'batch'
        : null;
  const reservedCaptureIds = new Set(ledger.reservations.map(item => item.captureId));
  const requestedCaptureIds = report.executionAllowed && report.authorizedStage
    ? report.authorizedCaptureIds
    : requestedStage === 'canary'
      ? [loadedPlan.plan.cohortCaptureIds[0]!]
      : requestedStage === 'batch'
        ? loadedPlan.plan.cohortCaptureIds.slice(1).filter(captureId => !reservedCaptureIds.has(captureId))
        : [];
  let receiptTemplate: PilotAuthorizationRequest['receiptTemplate'] = null;
  if (requestedStage === 'canary') {
    receiptTemplate = {
      schemaVersion: 'doccanvas-enrichment-stage-authorization-v1',
      pilotId: loadedPlan.plan.pilotId, pilotPlanHash: loadedPlan.planHash, jobPolicyHash: loadedPolicy.policyHash,
      stage: 'canary', expectedReservedCalls: 0, maxNewCalls: 1, allowedCaptureIds: requestedCaptureIds,
    };
  } else if (requestedStage === 'batch' && ledger.reservations[0] && options.canaryReviewFile) {
    const review = readCanaryReviewEvidence({ reviewFile: options.canaryReviewFile, planFile: options.planFile, now });
    receiptTemplate = {
      schemaVersion: 'doccanvas-enrichment-stage-authorization-v1',
      pilotId: loadedPlan.plan.pilotId, pilotPlanHash: loadedPlan.planHash, jobPolicyHash: loadedPolicy.policyHash,
      stage: 'batch', expectedReservedCalls: 1, maxNewCalls: 19,
      canaryReservationId: ledger.reservations[0].reservationId, canaryReviewHash: review.reviewHash,
      allowedCaptureIds: requestedCaptureIds,
    };
  }
  const state: PilotAuthorizationRequest['state'] = report.executionAllowed && report.stageAuthorizationId
    ? 'receipt_present'
    : receiptTemplate && (report.readyForCanary || report.readyForBatch || report.state === 'batch_in_progress')
      ? 'ready_for_receipt'
      : 'blocked';
  const projected = policyProjection(loadedPolicy.policy);
  return finalize({
    schemaVersion: 'doccanvas-enrichment-authorization-request-v2', generatedAt: now,
    evidenceGrade: 'L2-fixture-or-dry-run', state,
    providerCall: false, authorizationGranted: false, executionAllowed: report.executionAllowed,
    pilotId: loadedPlan.plan.pilotId, jobId: loadedPolicy.policy.jobId,
    providerId: loadedPolicy.policy.providerId, modelId: loadedPolicy.policy.modelId,
    policyHash: loadedPolicy.policyHash, planHash: loadedPlan.planHash,
    requestedStage, requestedCaptureIds, requestedCalls: requestedCaptureIds.length,
    ledgerBaseline: {
      reservedCalls: ledger.budget.reservedCalls,
      providerCompletedCalls: ledger.budget.providerCompletedCalls,
      providerFailedCalls: ledger.budget.providerFailedCalls,
      remainingCalls: ledger.budget.remainingCalls,
    },
    limits: projected.limits, dataEgress: projected.dataEgress,
    stageAuthorizationId: report.stageAuthorizationId, stageAuthorizationHash: report.stageAuthorizationHash,
    receiptTemplate,
    requiredOperatorFields: receiptTemplate ? ['authorizationId', 'authorizedBy', 'authorizedAt', 'validUntil'] : [],
    gates: report.gates,
    blockers: configuredBlockers(report.gates, state),
    nextAction: state === 'ready_for_receipt' ? `approve_exact_${requestedStage}_receipt`
      : state === 'receipt_present' ? report.nextAction : report.nextAction,
  });
}

export function getConfiguredPilotAuthorizationRequest(now = new Date().toISOString()): PilotAuthorizationRequest {
  const planFile = process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE?.trim();
  if (!planFile) return disabledPilotAuthorizationRequest('pilot_plan_not_configured', now);
  const providerId = process.env.DOCCANVAS_ENRICHMENT_PROVIDER?.trim() || null;
  const modelId = process.env.DOCCANVAS_ENRICHMENT_MODEL?.trim() || null;
  if (
    process.env.DOCCANVAS_ENRICHMENT_MODE?.trim() !== 'provider'
    || !providerId || !['openai', 'deepseek', 'kimi'].includes(providerId) || !modelId
  ) {
    return disabledPilotAuthorizationRequest('pilot_provider_environment_mismatch', now, 'blocked', providerId, modelId);
  }
  const required = {
    policyFile: process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE?.trim(),
    apiKeyFile: process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE?.trim(),
    ledgerFile: process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH?.trim(),
    captureStoreDir: process.env.DOCCANVAS_CAPTURE_STORE_PATH?.trim(),
    enrichmentStoreDir: process.env.DOCCANVAS_ENRICHMENT_STORE_PATH?.trim(),
    goldStoreDir: process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH?.trim(),
  };
  if (Object.values(required).some(value => !value || !isAbsolute(value))) {
    return disabledPilotAuthorizationRequest('pilot_environment_incomplete', now, 'blocked', providerId, modelId);
  }
  try {
    const request = buildPilotAuthorizationRequest({
      planFile, policyFile: required.policyFile!, apiKeyFile: required.apiKeyFile!, ledgerFile: required.ledgerFile!,
      captureStoreDir: required.captureStoreDir!, enrichmentStoreDir: required.enrichmentStoreDir!, goldStoreDir: required.goldStoreDir!,
      canaryReviewFile: process.env.DOCCANVAS_ENRICHMENT_CANARY_REVIEW_FILE?.trim() || undefined,
      goldCompletionFile: process.env.DOCCANVAS_ENRICHMENT_GOLD_COMPLETION_FILE?.trim() || undefined,
      stageAuthorizationFile: process.env.DOCCANVAS_ENRICHMENT_STAGE_AUTHORIZATION_FILE?.trim() || undefined,
      now,
    });
    if (request.modelId !== modelId) {
      return disabledPilotAuthorizationRequest('pilot_model_environment_mismatch', now, 'blocked', providerId, modelId);
    }
    return request;
  } catch (error) {
    const reason = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code.toLowerCase() : 'pilot_authorization_request_invalid';
    return disabledPilotAuthorizationRequest(reason, now, 'blocked', providerId, modelId);
  }
}
