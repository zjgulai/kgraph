import { createHash } from 'crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { z } from 'zod';
import { listCaptureRecords } from './knowledge-capture-store';
import { listCurrentGoldAnnotations } from './knowledge-enrichment-eval';
import {
  ProviderRuntimeError,
  inspectProviderApiKeyFile,
  inspectProviderLedgerEvidence,
  readEnrichmentJobPolicy,
  type ProviderReservationGate,
} from './knowledge-enrichment-provider';
import { listEnrichmentRecords } from './knowledge-enrichment-store';

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/u;
const CAPTURE_ID = /^capture-[a-f0-9]{24}$/u;
const REQUIRED_COHORT_SIZE = 20;

const DateTimeSchema = z.string().refine(value => (
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && !Number.isNaN(Date.parse(value))
), 'invalid RFC3339 timestamp');

export const EnrichmentPilotPlanSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-pilot-plan-v1'),
  pilotId: z.string().regex(SAFE_ID),
  jobId: z.string().regex(SAFE_ID),
  jobPolicyHash: z.string().regex(HASH),
  createdAt: DateTimeSchema,
  validUntil: DateTimeSchema,
  cohortCaptureIds: z.array(z.string().regex(CAPTURE_ID)).length(REQUIRED_COHORT_SIZE),
  humanGold: z.object({
    assignmentId: z.string().regex(SAFE_ID),
    annotator: z.string().trim().min(1).max(160),
    dueAt: DateTimeSchema,
    requiredCount: z.literal(REQUIRED_COHORT_SIZE),
    independentSourceReview: z.literal(true),
    modelOutputNotCopied: z.literal(true),
  }).strict(),
  stages: z.object({
    canaryCalls: z.literal(1),
    batchCalls: z.literal(19),
    pauseAfterCanary: z.literal(true),
  }).strict(),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.cohortCaptureIds).size !== REQUIRED_COHORT_SIZE) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cohortCaptureIds'], message: 'must contain 20 unique Capture IDs' });
  }
  if (Date.parse(plan.validUntil) <= Date.parse(plan.createdAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'must be after createdAt' });
  }
  if (Date.parse(plan.humanGold.dueAt) <= Date.parse(plan.createdAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['humanGold', 'dueAt'], message: 'must be after createdAt' });
  }
});

export const EnrichmentCanaryReviewSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-canary-review-v2'),
  pilotId: z.string().regex(SAFE_ID),
  pilotPlanHash: z.string().regex(HASH),
  reservationId: z.string().regex(HASH),
  decision: z.enum(['approved_for_batch', 'rejected']),
  reviewedBy: z.string().trim().min(1).max(160),
  reviewedAt: DateTimeSchema,
  checks: z.object({
    schemaValid: z.boolean(),
    sourceGrounded: z.boolean(),
    sensitiveDataAcceptable: z.boolean(),
    usageAccepted: z.boolean(),
    sourceLanguagePreserved: z.boolean(),
    domainTaxonomyPreserved: z.boolean(),
  }).strict(),
}).strict().superRefine((review, context) => {
  if (review.decision === 'approved_for_batch' && Object.values(review.checks).some(value => value !== true)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['checks'], message: 'all checks must pass for batch approval' });
  }
});

export const EnrichmentGoldCompletionSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-gold-completion-v1'),
  pilotId: z.string().regex(SAFE_ID),
  pilotPlanHash: z.string().regex(HASH),
  assignmentId: z.string().regex(SAFE_ID),
  taskPackId: z.string().regex(/^gold-pack-[a-f0-9]{24}$/u),
  taskPackHash: z.string().regex(HASH),
  completedBy: z.string().trim().min(1).max(160),
  completedAt: DateTimeSchema,
  independentSourceReview: z.literal(true),
  modelOutputNotCopied: z.literal(true),
  items: z.array(z.object({
    captureId: z.string().regex(CAPTURE_ID),
    sourceHash: z.string().regex(HASH),
  }).strict()).length(REQUIRED_COHORT_SIZE),
}).strict().superRefine((receipt, context) => {
  if (new Set(receipt.items.map(item => item.captureId)).size !== REQUIRED_COHORT_SIZE) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'must contain 20 unique Capture IDs' });
  }
});

const StageAuthorizationBaseSchema = z.object({
  schemaVersion: z.literal('doccanvas-enrichment-stage-authorization-v1'),
  authorizationId: z.string().regex(SAFE_ID),
  pilotId: z.string().regex(SAFE_ID),
  pilotPlanHash: z.string().regex(HASH),
  jobPolicyHash: z.string().regex(HASH),
  authorizedBy: z.string().trim().min(1).max(160),
  authorizedAt: DateTimeSchema,
  validUntil: DateTimeSchema,
});

export const EnrichmentStageAuthorizationSchema = z.discriminatedUnion('stage', [
  StageAuthorizationBaseSchema.extend({
    stage: z.literal('canary'),
    expectedReservedCalls: z.literal(0),
    maxNewCalls: z.literal(1),
    allowedCaptureIds: z.array(z.string().regex(CAPTURE_ID)).length(1),
  }).strict(),
  StageAuthorizationBaseSchema.extend({
    stage: z.literal('batch'),
    expectedReservedCalls: z.literal(1),
    maxNewCalls: z.literal(19),
    canaryReservationId: z.string().regex(HASH),
    canaryReviewHash: z.string().regex(HASH),
    allowedCaptureIds: z.array(z.string().regex(CAPTURE_ID)).length(19),
  }).strict(),
]).superRefine((authorization, context) => {
  if (new Set(authorization.allowedCaptureIds).size !== authorization.allowedCaptureIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedCaptureIds'], message: 'must be unique' });
  }
  if (Date.parse(authorization.validUntil) <= Date.parse(authorization.authorizedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'must be after authorizedAt' });
  }
});

export type EnrichmentPilotPlan = z.infer<typeof EnrichmentPilotPlanSchema>;
export type EnrichmentCanaryReview = z.infer<typeof EnrichmentCanaryReviewSchema>;
export type EnrichmentGoldCompletion = z.infer<typeof EnrichmentGoldCompletionSchema>;
export type EnrichmentStageAuthorization = z.infer<typeof EnrichmentStageAuthorizationSchema>;

export type PilotGateId = 'policy' | 'authorization' | 'cohort' | 'budget' | 'canary' | 'gold' | 'stage_authorization';
export type PilotGateStatus = 'pass' | 'ready' | 'pending' | 'blocked';

export interface PilotReadinessGate {
  id: PilotGateId;
  status: PilotGateStatus;
  reason: string;
  actual: number | string | boolean | null;
  required: number | string | boolean;
}

export interface PilotReadinessReport {
  schemaVersion: 'doccanvas-enrichment-pilot-readiness-v2';
  mode: 'disabled' | 'configured';
  state: 'not_configured' | 'blocked' | 'ready_for_canary' | 'canary_review_required' | 'ready_for_batch' | 'batch_in_progress' | 'ready_for_evaluation';
  pilotId: string | null;
  planHash: string | null;
  jobId: string | null;
  modelId: string | null;
  cohortCount: number;
  resultCount: number;
  goldCount: number;
  reservedCalls: number;
  providerCompletedCalls: number;
  providerFailedCalls: number;
  remainingCalls: number;
  readyForCanary: boolean;
  readyForBatch: boolean;
  readyForReadinessEvaluation: boolean;
  authorizedStage: 'canary' | 'batch' | null;
  stageAuthorizationId: string | null;
  stageAuthorizationHash: string | null;
  authorizedCaptureIds: string[];
  executionAllowed: boolean;
  gates: PilotReadinessGate[];
  nextAction: string;
}

export class PilotControlError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = 'PilotControlError';
  }
}

function fail(code: string, message: string, status = 400): never {
  throw new PilotControlError(code, message, status);
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

function readSafeJson(path: string, kind: 'plan' | 'review' | 'gold' | 'stage'): unknown {
  const code = kind === 'plan' ? 'PILOT_PLAN'
    : kind === 'review' ? 'PILOT_CANARY_REVIEW'
      : kind === 'gold' ? 'PILOT_GOLD_COMPLETION'
        : 'PILOT_STAGE_AUTHORIZATION';
  if (!isAbsolute(path)) fail(`${code}_PATH_INVALID`, 'configured path must be absolute', 500);
  const absolute = resolve(path);
  if (!existsSync(absolute)) fail(`${code}_NOT_FOUND`, 'configured file does not exist', 503);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${code}_FILE_INVALID`, 'configured file must be a regular file', 500);
  if ((stat.mode & 0o022) !== 0) fail(`${code}_FILE_INVALID`, 'configured file must not be group/world writable', 500);
  if (stat.size < 2 || stat.size > 64 * 1024) fail(`${code}_FILE_INVALID`, 'configured file size is invalid', 500);
  try {
    return JSON.parse(readFileSync(realpathSync(absolute), 'utf8')) as unknown;
  } catch {
    fail(`${code}_INVALID`, 'configured file must be valid UTF-8 JSON', 500);
  }
}

export function readPilotPlan(options: { planFile: string; now?: string }): {
  plan: EnrichmentPilotPlan;
  planHash: string;
} {
  const parsed = EnrichmentPilotPlanSchema.safeParse(readSafeJson(options.planFile, 'plan'));
  if (!parsed.success) fail('PILOT_PLAN_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 500);
  const now = options.now ?? new Date().toISOString();
  if (!DateTimeSchema.safeParse(now).success) fail('PILOT_TIME_INVALID', 'now must be RFC3339', 500);
  if (Date.parse(now) < Date.parse(parsed.data.createdAt)) fail('PILOT_NOT_ACTIVE', parsed.data.pilotId, 409);
  if (Date.parse(now) > Date.parse(parsed.data.validUntil)) fail('PILOT_EXPIRED', parsed.data.pilotId, 409);
  return { plan: parsed.data, planHash: hashValue(parsed.data) };
}

function readCanaryReview(options: { reviewFile: string; plan: EnrichmentPilotPlan; planHash: string }): EnrichmentCanaryReview {
  const parsed = EnrichmentCanaryReviewSchema.safeParse(readSafeJson(options.reviewFile, 'review'));
  if (!parsed.success) fail('PILOT_CANARY_REVIEW_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 500);
  if (parsed.data.pilotId !== options.plan.pilotId || parsed.data.pilotPlanHash !== options.planHash) {
    fail('PILOT_CANARY_REVIEW_PLAN_MISMATCH', options.plan.pilotId, 409);
  }
  return parsed.data;
}

export function readCanaryReviewEvidence(options: { reviewFile: string; planFile: string; now?: string }): {
  review: EnrichmentCanaryReview;
  reviewHash: string;
} {
  const now = options.now ?? new Date().toISOString();
  const loaded = readPilotPlan({ planFile: options.planFile, now });
  const review = readCanaryReview({ reviewFile: options.reviewFile, plan: loaded.plan, planHash: loaded.planHash });
  if (Date.parse(review.reviewedAt) > Date.parse(now)) fail('PILOT_CANARY_REVIEW_FROM_FUTURE', loaded.plan.pilotId, 409);
  return { review, reviewHash: hashValue(review) };
}

export function readStageAuthorization(options: { authorizationFile: string; planFile: string; now?: string }): {
  authorization: EnrichmentStageAuthorization;
  authorizationHash: string;
} {
  const now = options.now ?? new Date().toISOString();
  const loaded = readPilotPlan({ planFile: options.planFile, now });
  const parsed = EnrichmentStageAuthorizationSchema.safeParse(readSafeJson(options.authorizationFile, 'stage'));
  if (!parsed.success) {
    fail('PILOT_STAGE_AUTHORIZATION_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 500);
  }
  const authorization = parsed.data;
  if (authorization.pilotId !== loaded.plan.pilotId || authorization.pilotPlanHash !== loaded.planHash
    || authorization.jobPolicyHash !== loaded.plan.jobPolicyHash) {
    fail('PILOT_STAGE_AUTHORIZATION_PLAN_MISMATCH', loaded.plan.pilotId, 409);
  }
  if (Date.parse(authorization.authorizedAt) < Date.parse(loaded.plan.createdAt)
    || Date.parse(authorization.validUntil) > Date.parse(loaded.plan.validUntil)
    || Date.parse(now) < Date.parse(authorization.authorizedAt)
    || Date.parse(now) > Date.parse(authorization.validUntil)) {
    fail('PILOT_STAGE_AUTHORIZATION_WINDOW_MISMATCH', authorization.authorizationId, 409);
  }
  const expected = authorization.stage === 'canary'
    ? [loaded.plan.cohortCaptureIds[0]!]
    : loaded.plan.cohortCaptureIds.slice(1);
  if (!sameSet(authorization.allowedCaptureIds, expected)) {
    fail('PILOT_STAGE_AUTHORIZATION_SCOPE_MISMATCH', authorization.authorizationId, 409);
  }
  return { authorization, authorizationHash: hashValue(authorization) };
}

function readGoldCompletion(options: {
  completionFile: string;
  plan: EnrichmentPilotPlan;
  planHash: string;
  now: string;
}): EnrichmentGoldCompletion {
  const parsed = EnrichmentGoldCompletionSchema.safeParse(readSafeJson(options.completionFile, 'gold'));
  if (!parsed.success) fail('PILOT_GOLD_COMPLETION_INVALID', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '), 500);
  if (
    parsed.data.pilotId !== options.plan.pilotId || parsed.data.pilotPlanHash !== options.planHash
    || parsed.data.assignmentId !== options.plan.humanGold.assignmentId
    || parsed.data.completedBy !== options.plan.humanGold.annotator
  ) fail('PILOT_GOLD_COMPLETION_PLAN_MISMATCH', options.plan.pilotId, 409);
  if (Date.parse(parsed.data.completedAt) > Date.parse(options.now)) fail('PILOT_GOLD_COMPLETION_FROM_FUTURE', options.plan.pilotId, 409);
  return parsed.data;
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function gate(id: PilotGateId, status: PilotGateStatus, reason: string, actual: PilotReadinessGate['actual'], required: PilotReadinessGate['required']): PilotReadinessGate {
  return { id, status, reason, actual, required };
}

export function disabledPilotReadiness(reason = 'pilot_plan_not_configured'): PilotReadinessReport {
  const gates: PilotReadinessGate[] = [
    gate('policy', 'blocked', reason, false, true),
    gate('authorization', 'blocked', reason, false, true),
    gate('cohort', 'blocked', reason, 0, REQUIRED_COHORT_SIZE),
    gate('budget', 'blocked', reason, 0, REQUIRED_COHORT_SIZE),
    gate('canary', 'blocked', reason, 0, 1),
    gate('gold', 'blocked', reason, 0, REQUIRED_COHORT_SIZE),
    gate('stage_authorization', 'blocked', reason, false, true),
  ];
  return {
    schemaVersion: 'doccanvas-enrichment-pilot-readiness-v2', mode: 'disabled', state: 'not_configured',
    pilotId: null, planHash: null, jobId: null, modelId: null,
    cohortCount: 0, resultCount: 0, goldCount: 0, reservedCalls: 0,
    providerCompletedCalls: 0, providerFailedCalls: 0, remainingCalls: 0,
    readyForCanary: false, readyForBatch: false, readyForReadinessEvaluation: false,
    authorizedStage: null, stageAuthorizationId: null, stageAuthorizationHash: null,
    authorizedCaptureIds: [], executionAllowed: false,
    gates, nextAction: 'configure_exact_pilot_plan',
  };
}

export function evaluatePilotReadiness(options: {
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
}): PilotReadinessReport {
  const now = options.now ?? new Date().toISOString();
  const loadedPlan = readPilotPlan({ planFile: options.planFile, now });
  const loadedPolicy = readEnrichmentJobPolicy({ policyFile: options.policyFile, now });
  const { plan, planHash } = loadedPlan;
  const { policy, policyHash } = loadedPolicy;
  if (plan.jobId !== policy.jobId || plan.jobPolicyHash !== policyHash) fail('PILOT_POLICY_HASH_MISMATCH', plan.pilotId, 409);
  if (Date.parse(plan.createdAt) < Date.parse(policy.validFrom) || Date.parse(plan.validUntil) > Date.parse(policy.validUntil)) {
    fail('PILOT_POLICY_WINDOW_MISMATCH', plan.pilotId, 409);
  }
  if (!sameSet(plan.cohortCaptureIds, policy.allowedCaptureIds)) fail('PILOT_COHORT_POLICY_MISMATCH', plan.pilotId, 409);
  if (policy.limits.maxCalls !== REQUIRED_COHORT_SIZE) fail('PILOT_CALL_BUDGET_NOT_EXACT', String(policy.limits.maxCalls), 409);
  if (plan.humanGold.annotator === policy.approvedBy) fail('PILOT_GOLD_ANNOTATOR_NOT_INDEPENDENT', plan.humanGold.annotator, 409);
  inspectProviderApiKeyFile(options.apiKeyFile);

  const captureById = new Map(listCaptureRecords({ storeDir: options.captureStoreDir }).map(record => [record.manifest.captureId, record]));
  const cohort = plan.cohortCaptureIds.map(captureId => {
    const record = captureById.get(captureId);
    if (!record) fail('PILOT_CAPTURE_NOT_FOUND', captureId, 409);
    if (Buffer.byteLength(readFileSync(record.sourcePath), 'utf8') > policy.limits.maxInputBytes) {
      fail('PILOT_CAPTURE_TOO_LARGE', captureId, 413);
    }
    return record;
  });
  const sourceHashes = new Map(cohort.map(record => [record.manifest.captureId, record.manifest.sourceHash]));
  const evidence = inspectProviderLedgerEvidence({ policyFile: options.policyFile, ledgerFile: options.ledgerFile, now });
  for (const reservation of evidence.reservations) {
    if (!plan.cohortCaptureIds.includes(reservation.captureId) || sourceHashes.get(reservation.captureId) !== reservation.inputHash) {
      fail('PILOT_LEDGER_COHORT_MISMATCH', reservation.captureId, 409);
    }
  }

  const resultByCapture = new Map(listEnrichmentRecords({ storeDir: options.enrichmentStoreDir })
    .filter(record => record.manifest.providerCall && record.manifest.executionMode === 'provider'
      && record.manifest.providerId === policy.providerId && record.manifest.modelId === policy.modelId
      && record.manifest.promptVersion === policy.promptVersion
      && sourceHashes.get(record.manifest.captureId) === record.manifest.inputHash)
    .map(record => [record.manifest.captureId, record]));
  const goldCount = listCurrentGoldAnnotations({ storeDir: options.goldStoreDir })
    .filter(record => sourceHashes.get(record.annotation.captureId) === record.annotation.sourceHash).length;
  const reservations = evidence.reservations;
  const first = reservations[0];
  const review = options.canaryReviewFile ? readCanaryReview({ reviewFile: options.canaryReviewFile, plan, planHash }) : null;
  if (review && Date.parse(review.reviewedAt) > Date.parse(now)) fail('PILOT_CANARY_REVIEW_FROM_FUTURE', plan.pilotId, 409);
  if (review && reservations.slice(1).some(item => Date.parse(item.reservedAt) < Date.parse(review.reviewedAt))) {
    fail('PILOT_BATCH_STARTED_BEFORE_APPROVAL', plan.pilotId, 409);
  }
  let canaryGate: PilotReadinessGate;
  if (!first) {
    if (review) fail('PILOT_CANARY_REVIEW_WITHOUT_RUN', plan.pilotId, 409);
    canaryGate = gate('canary', 'ready', 'canary_authorized_not_executed', 0, 1);
  } else if (first.providerStatus !== 'provider_succeeded') {
    canaryGate = gate('canary', 'blocked', first.providerStatus === 'provider_failed' ? 'canary_provider_failed' : 'canary_provider_outcome_missing', first.providerStatus, 'provider_succeeded');
  } else if (!first.usageComplete) {
    canaryGate = gate('canary', 'blocked', 'canary_usage_incomplete', false, true);
  } else if (!resultByCapture.has(first.captureId)) {
    canaryGate = gate('canary', 'blocked', 'canary_result_missing', false, true);
  } else if (!review) {
    canaryGate = gate('canary', 'pending', 'canary_review_required', 'missing', 'approved_for_batch');
  } else if (review.reservationId !== first.reservationId || (first.outcomeAt && Date.parse(review.reviewedAt) < Date.parse(first.outcomeAt))) {
    fail('PILOT_CANARY_REVIEW_EVIDENCE_MISMATCH', plan.pilotId, 409);
  } else if (review.decision !== 'approved_for_batch') {
    canaryGate = gate('canary', 'blocked', 'canary_rejected', review.decision, 'approved_for_batch');
  } else {
    canaryGate = gate('canary', 'pass', 'canary_review_approved', review.decision, 'approved_for_batch');
  }

  const baseGates: PilotReadinessGate[] = [
    gate('policy', 'pass', 'plan_policy_hash_and_window_match', policyHash, plan.jobPolicyHash),
    gate('authorization', 'pass', 'egress_secret_and_independent_gold_accountability_present', true, true),
    gate('cohort', 'pass', 'twenty_intact_captures_match_allowlist', cohort.length, REQUIRED_COHORT_SIZE),
    gate('budget', evidence.budget.remainingCalls >= Math.max(REQUIRED_COHORT_SIZE - evidence.budget.reservedCalls, 0) ? 'pass' : 'blocked',
      evidence.budget.remainingCalls >= Math.max(REQUIRED_COHORT_SIZE - evidence.budget.reservedCalls, 0) ? 'exact_call_budget_available' : 'remaining_call_budget_insufficient',
      evidence.budget.remainingCalls, Math.max(REQUIRED_COHORT_SIZE - evidence.budget.reservedCalls, 0)),
  ];
  const completion = options.goldCompletionFile
    ? readGoldCompletion({ completionFile: options.goldCompletionFile, plan, planHash, now })
    : null;
  if (completion) {
    const completionHashes = new Map(completion.items.map(item => [item.captureId, item.sourceHash]));
    if (!sameSet(completion.items.map(item => item.captureId), plan.cohortCaptureIds)
      || plan.cohortCaptureIds.some(captureId => completionHashes.get(captureId) !== sourceHashes.get(captureId))) {
      fail('PILOT_GOLD_COMPLETION_COHORT_MISMATCH', plan.pilotId, 409);
    }
  }
  const goldComplete = goldCount === REQUIRED_COHORT_SIZE && completion !== null;
  const goldOverdue = !goldComplete && Date.parse(now) > Date.parse(plan.humanGold.dueAt);
  const goldGate = gate('gold', goldComplete ? 'pass' : goldOverdue ? 'blocked' : 'pending',
    goldComplete ? 'independent_gold_and_completion_receipt_match'
      : goldOverdue ? 'gold_assignment_overdue'
        : goldCount === REQUIRED_COHORT_SIZE ? 'gold_completion_receipt_required' : 'independent_gold_incomplete',
    goldCount, REQUIRED_COHORT_SIZE);
  const gates = [...baseGates, canaryGate, goldGate];
  const basePass = baseGates.every(item => item.status === 'pass');
  const readyForCanary = basePass && reservations.length === 0;
  const readyForBatch = basePass && reservations.length === 1 && canaryGate.status === 'pass' && evidence.budget.remainingCalls === 19;
  const allResultsComplete = resultByCapture.size === REQUIRED_COHORT_SIZE
    && reservations.length === REQUIRED_COHORT_SIZE
    && reservations.every(item => item.providerStatus === 'provider_succeeded' && item.usageComplete);
  const readyForReadinessEvaluation = basePass && canaryGate.status === 'pass' && allResultsComplete && goldGate.status === 'pass';
  const state: PilotReadinessReport['state'] = readyForReadinessEvaluation ? 'ready_for_evaluation'
    : readyForBatch ? 'ready_for_batch'
      : readyForCanary ? 'ready_for_canary'
        : reservations.length === 1 && canaryGate.reason === 'canary_review_required' ? 'canary_review_required'
          : reservations.length > 1 && reservations.length < REQUIRED_COHORT_SIZE && canaryGate.status === 'pass' ? 'batch_in_progress'
            : 'blocked';
  let authorizedStage: PilotReadinessReport['authorizedStage'] = null;
  let stageAuthorizationId: string | null = null;
  let stageAuthorizationHash: string | null = null;
  let authorizedCaptureIds: string[] = [];
  let executionAllowed = false;
  let stageGate = gate('stage_authorization', 'pending', 'stage_authorization_required', false, true);
  if (options.stageAuthorizationFile) {
    const loadedAuthorization = readStageAuthorization({
      authorizationFile: options.stageAuthorizationFile,
      planFile: options.planFile,
      now,
    });
    const authorization = loadedAuthorization.authorization;
    authorizedStage = authorization.stage;
    stageAuthorizationId = authorization.authorizationId;
    stageAuthorizationHash = loadedAuthorization.authorizationHash;
    const reservedCaptureIds = new Set(reservations.map(item => item.captureId));
    authorizedCaptureIds = authorization.allowedCaptureIds.filter(captureId => !reservedCaptureIds.has(captureId));
    if (authorization.stage === 'canary') {
      executionAllowed = readyForCanary && reservations.length === authorization.expectedReservedCalls
        && authorizedCaptureIds.length === 1;
      stageGate = gate('stage_authorization', executionAllowed ? 'pass' : 'blocked',
        executionAllowed ? 'canary_stage_authorized' : 'canary_stage_not_executable',
        executionAllowed, true);
    } else {
      const reviewHash = review ? hashValue(review) : null;
      if (!first || authorization.canaryReservationId !== first.reservationId
        || authorization.canaryReviewHash !== reviewHash) {
        fail('PILOT_STAGE_AUTHORIZATION_EVIDENCE_MISMATCH', plan.pilotId, 409);
      }
      executionAllowed = basePass && canaryGate.status === 'pass'
        && reservations.length >= authorization.expectedReservedCalls
        && reservations.length < authorization.expectedReservedCalls + authorization.maxNewCalls
        && authorizedCaptureIds.length > 0;
      stageGate = gate('stage_authorization', executionAllowed ? 'pass' : 'blocked',
        executionAllowed ? 'batch_stage_authorized' : 'batch_stage_not_executable',
        executionAllowed, true);
    }
  }
  gates.push(stageGate);
  const nextAction = state === 'ready_for_canary' && !executionAllowed ? 'provide_canary_stage_authorization'
    : state === 'ready_for_canary' ? 'execute_authorized_canary'
    : state === 'canary_review_required' ? 'complete_independent_canary_review'
      : state === 'ready_for_batch' && !executionAllowed ? 'provide_batch_stage_authorization'
        : state === 'ready_for_batch' ? 'execute_authorized_batch'
          : state === 'batch_in_progress' && executionAllowed ? 'finish_authorized_batch_without_retry'
            : state === 'batch_in_progress' ? 'restore_valid_batch_stage_authorization'
          : state === 'ready_for_evaluation' ? 'run_deterministic_readiness_evaluation'
            : 'resolve_blocked_pilot_gates';
  return {
    schemaVersion: 'doccanvas-enrichment-pilot-readiness-v2', mode: 'configured', state,
    pilotId: plan.pilotId, planHash, jobId: policy.jobId, modelId: policy.modelId,
    cohortCount: cohort.length, resultCount: resultByCapture.size, goldCount,
    reservedCalls: evidence.budget.reservedCalls,
    providerCompletedCalls: evidence.budget.providerCompletedCalls,
    providerFailedCalls: evidence.budget.providerFailedCalls,
    remainingCalls: evidence.budget.remainingCalls,
    readyForCanary, readyForBatch, readyForReadinessEvaluation, gates, nextAction,
    authorizedStage, stageAuthorizationId, stageAuthorizationHash, authorizedCaptureIds, executionAllowed,
  };
}

export function createPilotReservationGate(options: {
  planFile: string;
  stageAuthorizationFile: string;
  policyFile: string;
  apiKeyFile: string;
  ledgerFile: string;
  captureStoreDir: string;
  enrichmentStoreDir: string;
  goldStoreDir: string;
  canaryReviewFile?: string;
  goldCompletionFile?: string;
  now?: () => string;
}): ProviderReservationGate {
  return context => {
    const now = options.now?.() ?? context.occurredAt;
    try {
      const loadedPlan = readPilotPlan({ planFile: options.planFile, now });
      const loadedAuthorization = readStageAuthorization({
        authorizationFile: options.stageAuthorizationFile,
        planFile: options.planFile,
        now,
      });
      const { plan, planHash } = loadedPlan;
      const authorization = loadedAuthorization.authorization;
      if (context.policyHash !== plan.jobPolicyHash || context.policyHash !== authorization.jobPolicyHash
        || context.policy.jobId !== plan.jobId) {
        fail('PILOT_STAGE_POLICY_MISMATCH', plan.pilotId, 409);
      }
      if (!authorization.allowedCaptureIds.includes(context.captureId)) {
        fail('PILOT_STAGE_CAPTURE_NOT_AUTHORIZED', context.captureId, 403);
      }
      const capture = listCaptureRecords({ storeDir: options.captureStoreDir })
        .find(record => record.manifest.captureId === context.captureId);
      if (!capture || capture.manifest.sourceHash !== context.inputHash) {
        fail('PILOT_STAGE_SOURCE_MISMATCH', context.captureId, 409);
      }
      const report = evaluatePilotReadiness({
        planFile: options.planFile,
        policyFile: options.policyFile,
        apiKeyFile: options.apiKeyFile,
        ledgerFile: options.ledgerFile,
        captureStoreDir: options.captureStoreDir,
        enrichmentStoreDir: options.enrichmentStoreDir,
        goldStoreDir: options.goldStoreDir,
        canaryReviewFile: options.canaryReviewFile,
        goldCompletionFile: options.goldCompletionFile,
        stageAuthorizationFile: options.stageAuthorizationFile,
        now,
      });
      if (report.planHash !== planHash) fail('PILOT_STAGE_PLAN_DRIFT', plan.pilotId, 409);
      if (authorization.stage === 'canary') {
        if (context.reservations.length !== authorization.expectedReservedCalls || !report.readyForCanary || !report.executionAllowed) {
          fail('PILOT_CANARY_NOT_EXECUTABLE', report.nextAction, 409);
        }
        return;
      }
      const reviewFile = options.canaryReviewFile;
      if (!reviewFile) fail('PILOT_BATCH_REVIEW_REQUIRED', plan.pilotId, 409);
      const review = readCanaryReviewEvidence({ reviewFile, planFile: options.planFile, now });
      const first = context.reservations[0];
      const canaryGate = report.gates.find(item => item.id === 'canary');
      if (
        context.reservations.length < authorization.expectedReservedCalls
        || context.reservations.length >= authorization.expectedReservedCalls + authorization.maxNewCalls
        || !first || first.reservationId !== authorization.canaryReservationId
        || review.reviewHash !== authorization.canaryReviewHash
        || review.review.reservationId !== authorization.canaryReservationId
        || review.review.decision !== 'approved_for_batch'
        || canaryGate?.status !== 'pass'
        || !report.executionAllowed
      ) {
        fail('PILOT_BATCH_NOT_EXECUTABLE', report.nextAction, 409);
      }
    } catch (error) {
      if (error instanceof ProviderRuntimeError) throw error;
      if (error instanceof PilotControlError) {
        throw new ProviderRuntimeError(`ENRICHMENT_${error.code}`, error.code, error.status);
      }
      throw new ProviderRuntimeError('ENRICHMENT_PILOT_STAGE_INVALID', 'pilot stage validation failed', 500);
    }
  };
}

export function createConfiguredPilotReservationGate(): ProviderReservationGate {
  const required = {
    planFile: process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE?.trim(),
    stageAuthorizationFile: process.env.DOCCANVAS_ENRICHMENT_STAGE_AUTHORIZATION_FILE?.trim(),
    policyFile: process.env.DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE?.trim(),
    apiKeyFile: process.env.DOCCANVAS_ENRICHMENT_API_KEY_FILE?.trim(),
    ledgerFile: process.env.DOCCANVAS_ENRICHMENT_LEDGER_PATH?.trim(),
    captureStoreDir: process.env.DOCCANVAS_CAPTURE_STORE_PATH?.trim(),
    enrichmentStoreDir: process.env.DOCCANVAS_ENRICHMENT_STORE_PATH?.trim(),
    goldStoreDir: process.env.DOCCANVAS_ENRICHMENT_GOLD_PATH?.trim(),
  };
  if (Object.values(required).some(value => !value || !isAbsolute(value))) {
    throw new ProviderRuntimeError('ENRICHMENT_PILOT_STAGE_CONFIGURATION_INCOMPLETE', 'pilot stage paths are required', 503);
  }
  return createPilotReservationGate({
    planFile: required.planFile!,
    stageAuthorizationFile: required.stageAuthorizationFile!,
    policyFile: required.policyFile!,
    apiKeyFile: required.apiKeyFile!,
    ledgerFile: required.ledgerFile!,
    captureStoreDir: required.captureStoreDir!,
    enrichmentStoreDir: required.enrichmentStoreDir!,
    goldStoreDir: required.goldStoreDir!,
    canaryReviewFile: process.env.DOCCANVAS_ENRICHMENT_CANARY_REVIEW_FILE?.trim() || undefined,
    goldCompletionFile: process.env.DOCCANVAS_ENRICHMENT_GOLD_COMPLETION_FILE?.trim() || undefined,
  });
}

export function getConfiguredPilotReadiness(now = new Date().toISOString()): PilotReadinessReport {
  const planFile = process.env.DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE?.trim();
  if (!planFile) return disabledPilotReadiness();
  const mode = process.env.DOCCANVAS_ENRICHMENT_MODE?.trim();
  const providerId = process.env.DOCCANVAS_ENRICHMENT_PROVIDER?.trim();
  const modelId = process.env.DOCCANVAS_ENRICHMENT_MODEL?.trim();
  if (mode !== 'provider' || !providerId || !['openai', 'deepseek', 'kimi'].includes(providerId) || !modelId) {
    return { ...disabledPilotReadiness('pilot_provider_environment_mismatch'), mode: 'configured', state: 'blocked' };
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
    return { ...disabledPilotReadiness('pilot_environment_incomplete'), mode: 'configured', state: 'blocked' };
  }
  try {
    const report = evaluatePilotReadiness({
      planFile,
      policyFile: required.policyFile!, apiKeyFile: required.apiKeyFile!, ledgerFile: required.ledgerFile!,
      captureStoreDir: required.captureStoreDir!, enrichmentStoreDir: required.enrichmentStoreDir!, goldStoreDir: required.goldStoreDir!,
      canaryReviewFile: process.env.DOCCANVAS_ENRICHMENT_CANARY_REVIEW_FILE?.trim() || undefined,
      goldCompletionFile: process.env.DOCCANVAS_ENRICHMENT_GOLD_COMPLETION_FILE?.trim() || undefined,
      stageAuthorizationFile: process.env.DOCCANVAS_ENRICHMENT_STAGE_AUTHORIZATION_FILE?.trim() || undefined,
      now,
    });
    if (report.modelId !== modelId) {
      return { ...disabledPilotReadiness('pilot_model_environment_mismatch'), mode: 'configured', state: 'blocked' };
    }
    return report;
  } catch (error) {
    const reason = error instanceof PilotControlError ? error.code.toLowerCase() : 'pilot_preflight_invalid';
    return { ...disabledPilotReadiness(reason), mode: 'configured', state: 'blocked' };
  }
}
