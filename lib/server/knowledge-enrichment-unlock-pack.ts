import { createHash } from 'crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, isAbsolute, join, resolve } from 'path';
import type { KnowledgeObject } from '../../../scripts/lib/knowledge-object-contract';
import { extractMarkdownSections, type MarkdownSection } from '../markdown/sections';
import { BUILTIN_DOCUMENTS } from '../shared/document-registry';
import { createCapture } from './knowledge-capture-store';
import { inspectProviderApiKeyFile, readEnrichmentJobPolicy } from './knowledge-enrichment-provider';
import { readPilotPlan } from './knowledge-enrichment-pilot';
import { projectPath } from './project-root';

const PROVIDER_PROFILES = {
  openai: {
    modelId: 'gpt-5.6-terra',
    modelSource: 'https://developers.openai.com/api/docs/guides/latest-model',
    apiSupportSource: 'https://developers.openai.com/api/docs/guides/your-data#api-endpoint-tool-and-model-support',
    rationale: 'Exact balanced GPT-5.6 model for a bounded twenty-item structured extraction pilot; independent gold decides readiness.',
    inferenceMode: 'provider-default-medium',
    providerLabel: 'OpenAI',
  },
  deepseek: {
    modelId: 'deepseek-v4-flash',
    modelSource: 'https://api-docs.deepseek.com/quick_start/pricing',
    apiSupportSource: 'https://api-docs.deepseek.com/api/create-chat-completion/',
    rationale: 'Exact low-cost non-thinking DeepSeek model with strict structured tool output for the bounded primary pilot; independent gold decides readiness.',
    inferenceMode: 'thinking-disabled',
    providerLabel: 'DeepSeek',
  },
  kimi: {
    modelId: 'kimi-k2.6',
    modelSource: 'https://platform.kimi.com/docs/models',
    apiSupportSource: 'https://platform.kimi.com/docs/api/chat',
    rationale: 'Exact Kimi model with non-thinking JSON Schema output, reserved for a separately authorized review pilot; independent gold decides readiness.',
    inferenceMode: 'thinking-disabled',
    providerLabel: 'Kimi',
  },
} as const;
export type UnlockPackProviderId = keyof typeof PROVIDER_PROFILES;
const MAX_INPUT_BYTES = 24 * 1024;
const MAX_OUTPUT_TOKENS = 900;
const TIMEOUT_MS = 30_000;
const POLICY_WINDOW_MS = 24 * 60 * 60 * 1000;
const GOLD_DUE_MS = 20 * 60 * 60 * 1000;

interface CohortSelection {
  documentId: 'vibe-track' | 'v2-pro' | 'playbook-v2';
  parentHeading: string;
  heading: string;
  depth: 2 | 3 | 4;
  objectType: KnowledgeObject['object_type'];
  knowledgeForm: {
    primary: KnowledgeObject['knowledge_form']['primary'];
    subform: KnowledgeObject['knowledge_form']['subforms'][number];
  };
  domainRef: string;
}

const COHORT_SELECTIONS: readonly CohortSelection[] = [
  { documentId: 'vibe-track', parentHeading: '阶段①：需求洞察与验证（1-2天）', heading: '🚀 Vibe Track', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'procedure', subform: 'workflow' }, domainRef: 'ai-product.lifecycle.discovery' },
  { documentId: 'vibe-track', parentHeading: '阶段②：产品设计（2-5天）', heading: '🚀 Vibe Track', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'procedure', subform: 'workflow' }, domainRef: 'ai-product.lifecycle.design' },
  { documentId: 'vibe-track', parentHeading: '阶段③：技术架构（1-2天）', heading: '🛠️ Pro Track', depth: 3, objectType: 'decision', knowledgeForm: { primary: 'framework', subform: 'architecture' }, domainRef: 'ai-product.lifecycle.architecture' },
  { documentId: 'vibe-track', parentHeading: '阶段④：开发实施（1-4周）', heading: '🚀 Vibe Track', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'procedure', subform: 'playbook' }, domainRef: 'ai-product.lifecycle.delivery' },
  { documentId: 'vibe-track', parentHeading: '阶段⑤：测试与修复（贯穿开发，集中 2-3 天）', heading: '🛠️ Pro Track', depth: 3, objectType: 'quality_gate', knowledgeForm: { primary: 'procedure', subform: 'checklist' }, domainRef: 'ai-product.lifecycle.evaluation' },
  { documentId: 'vibe-track', parentHeading: '阶段⑧：持续进化（AI产品的灵魂）', heading: '🛠️ Pro Track', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'metacognitive', subform: 'learning_strategy' }, domainRef: 'ai-product.lifecycle.evolution' },
  { documentId: 'v2-pro', parentHeading: '产品类型分类：5种技术架构原型', heading: '原型 A：对话/Agent 型 🟢（最成熟）', depth: 3, objectType: 'decision', knowledgeForm: { primary: 'framework', subform: 'taxonomy' }, domainRef: 'ai-product.architecture.profiles' },
  { documentId: 'v2-pro', parentHeading: '第〇部分：开发环境基础设施（2026版）', heading: '0.2 MCP 装备清单（2026全面更新）', depth: 3, objectType: 'tool', knowledgeForm: { primary: 'procedure', subform: 'checklist' }, domainRef: 'ai-product.engineering.tooling' },
  { documentId: 'v2-pro', parentHeading: '阶段③：技术架构（1-2天）', heading: '推荐骨干技术栈（2026年 最佳实践）', depth: 3, objectType: 'technology', knowledgeForm: { primary: 'framework', subform: 'architecture' }, domainRef: 'ai-product.architecture.stack' },
  { documentId: 'v2-pro', parentHeading: '阶段③：技术架构（1-2天）', heading: 'TOP 3 架构层工具', depth: 3, objectType: 'tool', knowledgeForm: { primary: 'framework', subform: 'decision_framework' }, domainRef: 'ai-product.architecture.tools' },
  { documentId: 'v2-pro', parentHeading: '阶段④：开发实施（1-4周，MVP级别）', heading: '4.4 Agent能力开发（核心差异点）', depth: 3, objectType: 'capability_gene', knowledgeForm: { primary: 'procedure', subform: 'playbook' }, domainRef: 'ai-product.engineering.agents' },
  { documentId: 'v2-pro', parentHeading: '阶段⑤：测试与评估（贯穿开发，专项3-5天）', heading: 'TOP 3 测试与评估工具', depth: 3, objectType: 'tool', knowledgeForm: { primary: 'framework', subform: 'decision_framework' }, domainRef: 'ai-product.evaluation.tools' },
  { documentId: 'v2-pro', parentHeading: '阶段⑥：部署与运维（1-2天）', heading: 'TOP 3 部署运维工具', depth: 3, objectType: 'tool', knowledgeForm: { primary: 'framework', subform: 'decision_framework' }, domainRef: 'ai-product.operations.tools' },
  { documentId: 'playbook-v2', parentHeading: '成熟度标注说明', heading: '🆕 Evidence Ladder：七级证据阶梯', depth: 3, objectType: 'quality_gate', knowledgeForm: { primary: 'framework', subform: 'model' }, domainRef: 'ai-product.governance.evidence' },
  { documentId: 'playbook-v2', parentHeading: '一、平台总览：从"开发一个产品"到"运营一个产品工厂"', heading: '1.2 平台架构三层模型', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'framework', subform: 'architecture' }, domainRef: 'ai-product.factory.platform' },
  { documentId: 'playbook-v2', parentHeading: '二、产品基因组系统', heading: '2.2 基因组结构', depth: 3, objectType: 'capability_gene', knowledgeForm: { primary: 'framework', subform: 'architecture' }, domainRef: 'ai-product.factory.genome' },
  { documentId: 'playbook-v2', parentHeading: '三、四维自进化引擎', heading: '3.1 维一：内容/知识自进化', depth: 3, objectType: 'pattern', knowledgeForm: { primary: 'metacognitive', subform: 'learning_strategy' }, domainRef: 'ai-product.factory.evolution' },
  { documentId: 'playbook-v2', parentHeading: '四、进化宪章：不可变的约束边界', heading: '四、进化宪章：不可变的约束边界', depth: 2, objectType: 'quality_gate', knowledgeForm: { primary: 'framework', subform: 'decision_framework' }, domainRef: 'ai-product.governance.constitution' },
  { documentId: 'playbook-v2', parentHeading: '五、Codex可执行指令格式规范', heading: '5.1 每条指令的标准模板', depth: 3, objectType: 'artifact', knowledgeForm: { primary: 'procedure', subform: 'playbook' }, domainRef: 'ai-product.factory.instructions' },
  { documentId: 'playbook-v2', parentHeading: '六、八阶段生命周期（Codex可执行版）', heading: '模块化规范文件：project-spec/how-security.md + project-spec/how-testing.md', depth: 4, objectType: 'quality_gate', knowledgeForm: { primary: 'procedure', subform: 'checklist' }, domainRef: 'ai-product.governance.security-testing' },
] as const;

interface CohortItem {
  documentId: CohortSelection['documentId'];
  parentHeading: string;
  heading: string;
  sectionHash: string;
  sourceDocumentHash: string;
  captureId: string;
  sourceHash: string;
  bytes: number;
}

interface UnlockPackManifest {
  schemaVersion: 'doccanvas-enrichment-unlock-pack-v1';
  generatedAt: string;
  status: 'awaiting_secret_install' | 'ready_for_authorization_request';
  evidenceGrade: 'L2-fixture-or-dry-run';
  providerCall: false;
  ledgerWrite: false;
  authorizationGranted: false;
  providerId: UnlockPackProviderId;
  modelId: (typeof PROVIDER_PROFILES)[UnlockPackProviderId]['modelId'];
  modelSelection: {
    observedAt: string;
    modelSource: string;
    apiSupportSource: string;
    rationale: string;
    inferenceMode: 'provider-default-medium' | 'thinking-disabled';
  };
  policyHash: string;
  planHash: string;
  secretExpectedPath: string;
  cohort: {
    documentCounts: Record<CohortSelection['documentId'], number>;
    items: CohortItem[];
  };
  nextAction: 'install_api_key_file_then_generate_authorization_request' | 'generate_authorization_request';
}

export interface EnrichmentUnlockPackResult {
  outputDir: string;
  status: UnlockPackManifest['status'];
  evidenceGrade: UnlockPackManifest['evidenceGrade'];
  providerCall: false;
  ledgerWrite: false;
  authorizationGranted: false;
  providerId: UnlockPackProviderId;
  modelId: (typeof PROVIDER_PROFILES)[UnlockPackProviderId]['modelId'];
  policyHash: string;
  planHash: string;
  captureIds: string[];
}

export class EnrichmentUnlockPackError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'EnrichmentUnlockPackError';
  }
}

function fail(code: string, message: string): never {
  throw new EnrichmentUnlockPackError(code, message);
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

function json(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function hashRaw(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function writeCreateOnly(path: string, content: string): void {
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
}

function isoAfter(now: string, milliseconds: number): string {
  return new Date(Date.parse(now) + milliseconds).toISOString();
}

function runId(now: string): string {
  return new Date(now).toISOString().replace(/\D/gu, '').slice(0, 14);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

function resolveSection(selection: CohortSelection, sections: MarkdownSection[]): MarkdownSection {
  let currentH2 = '';
  const matches: MarkdownSection[] = [];
  for (const section of sections) {
    if (section.depth === 2) currentH2 = section.heading;
    const parentHeading = section.depth === 2 ? section.heading : currentH2;
    if (
      section.depth === selection.depth
      && section.heading === selection.heading
      && parentHeading === selection.parentHeading
    ) matches.push(section);
  }
  if (matches.length !== 1) {
    fail('UNLOCK_PACK_SECTION_MISMATCH', `${selection.documentId}/${selection.parentHeading}/${selection.heading}: ${matches.length}`);
  }
  return matches[0]!;
}

function validateInputPaths(outputDir: string, apiKeyFile: string): { outputDir: string; parent: string } {
  if (!isAbsolute(outputDir)) fail('UNLOCK_PACK_OUTPUT_PATH_INVALID', 'outputDir must be absolute');
  if (!isAbsolute(apiKeyFile)) fail('UNLOCK_PACK_SECRET_PATH_INVALID', 'apiKeyFile must be absolute');
  const absoluteOutput = resolve(outputDir);
  if (existsSync(absoluteOutput)) fail('UNLOCK_PACK_ALREADY_EXISTS', absoluteOutput);
  const parent = dirname(absoluteOutput);
  if (!existsSync(parent)) fail('UNLOCK_PACK_OUTPUT_PARENT_NOT_FOUND', parent);
  const parentStat = lstatSync(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) fail('UNLOCK_PACK_OUTPUT_PARENT_INVALID', parent);
  return { outputDir: absoluteOutput, parent: realpathSync(parent) };
}

export function createEnrichmentUnlockPack(options: {
  outputDir: string;
  apiKeyFile: string;
  now?: string;
  providerId?: UnlockPackProviderId;
}): EnrichmentUnlockPackResult {
  const now = options.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) fail('UNLOCK_PACK_TIME_INVALID', now);
  const providerId = options.providerId ?? 'openai';
  const profile = PROVIDER_PROFILES[providerId];
  if (!profile) fail('UNLOCK_PACK_PROVIDER_UNSUPPORTED', String(providerId));
  const paths = validateInputPaths(options.outputDir, options.apiKeyFile);
  const apiKeyFile = resolve(options.apiKeyFile);
  const staging = join(paths.parent, `.${basename(paths.outputDir)}.${process.pid}.${Date.now()}.staging`);
  if (existsSync(staging)) fail('UNLOCK_PACK_STAGING_EXISTS', staging);
  mkdirSync(staging, { mode: 0o750 });

  try {
    const captureStoreDir = join(staging, 'captures');
    const enrichmentStoreDir = join(staging, 'enrichments');
    const goldStoreDir = join(staging, 'gold');
    mkdirSync(enrichmentStoreDir, { mode: 0o750 });
    mkdirSync(goldStoreDir, { mode: 0o750 });
    const documentCache = new Map<string, { markdown: string; hash: string; sections: MarkdownSection[] }>();
    const cohortItems: CohortItem[] = [];
    const captureIds: string[] = [];

    for (const [index, selection] of COHORT_SELECTIONS.entries()) {
      const document = BUILTIN_DOCUMENTS.find(item => item.id === selection.documentId);
      if (!document) fail('UNLOCK_PACK_DOCUMENT_NOT_FOUND', selection.documentId);
      let cached = documentCache.get(selection.documentId);
      if (!cached) {
        const markdown = readFileSync(projectPath(document.path), 'utf8');
        cached = { markdown, hash: hashRaw(markdown), sections: extractMarkdownSections(markdown) };
        documentCache.set(selection.documentId, cached);
      }
      const section = resolveSection(selection, cached.sections);
      const content = `# ${section.heading}\n\n${section.body.trim()}\n`;
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes < 1 || bytes > MAX_INPUT_BYTES) {
        fail('UNLOCK_PACK_SECTION_SIZE_INVALID', `${selection.documentId}/${section.heading}: ${bytes}`);
      }
      const capture = createCapture({
        storeDir: captureStoreDir,
        actor: 'owner.unlock-pack',
        mutationId: `unlock.${runId(now)}.${String(index + 1).padStart(2, '0')}`,
        capturedAt: now,
        request: {
          source: {
            kind: 'file',
            fileName: `${selection.documentId}-${section.hash}.md`,
            mediaType: 'text/markdown',
            content,
          },
          title: section.heading,
          objectType: selection.objectType,
          knowledgeForm: selection.knowledgeForm,
          domainRef: selection.domainRef,
        },
      });
      captureIds.push(capture.manifest.captureId);
      cohortItems.push({
        documentId: selection.documentId,
        parentHeading: selection.parentHeading,
        heading: selection.heading,
        sectionHash: section.hash,
        sourceDocumentHash: cached.hash,
        captureId: capture.manifest.captureId,
        sourceHash: capture.manifest.sourceHash,
        bytes,
      });
    }

    if (captureIds.length !== 20 || new Set(captureIds).size !== 20) {
      fail('UNLOCK_PACK_COHORT_INVALID', `${captureIds.length}/${new Set(captureIds).size}`);
    }

    const id = runId(now);
    const policyFile = join(staging, 'job-policy.json');
    const policy = {
      schemaVersion: 'doccanvas-enrichment-job-policy-v1',
      jobId: `enrichment.unlock.${id}`,
      approvalId: `approval.unlock-design.${id}`,
      approvedBy: 'owner.accountable',
      approvedAt: now,
      validFrom: now,
      validUntil: isoAfter(now, POLICY_WINDOW_MS),
      providerId,
      modelId: profile.modelId,
      promptVersion: 'knowledge-enrichment-v2',
      allowedCaptureIds: captureIds,
      dataEgress: {
        sourceText: true,
        metadata: ['captureId', 'sourceHash'],
        classification: `Only the selected atomic source text plus captureId and sourceHash may be sent to ${profile.providerLabel} for this one-time pilot.`,
      },
      limits: {
        maxCalls: 20,
        maxInputBytes: MAX_INPUT_BYTES,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: TIMEOUT_MS,
      },
    };
    writeCreateOnly(policyFile, json(policy));
    const loadedPolicy = readEnrichmentJobPolicy({ policyFile, now });

    const planFile = join(staging, 'pilot-plan.json');
    const plan = {
      schemaVersion: 'doccanvas-enrichment-pilot-plan-v1',
      pilotId: `pilot.unlock.${id}`,
      jobId: loadedPolicy.policy.jobId,
      jobPolicyHash: loadedPolicy.policyHash,
      createdAt: now,
      validUntil: loadedPolicy.policy.validUntil,
      cohortCaptureIds: captureIds,
      humanGold: {
        assignmentId: `gold.assignment.unlock.${id}`,
        annotator: 'reviewer.independent',
        dueAt: isoAfter(now, GOLD_DUE_MS),
        requiredCount: 20,
        independentSourceReview: true,
        modelOutputNotCopied: true,
      },
      stages: { canaryCalls: 1, batchCalls: 19, pauseAfterCanary: true },
    };
    writeCreateOnly(planFile, json(plan));
    const loadedPlan = readPilotPlan({ planFile, now });

    const finalCaptureStoreDir = join(paths.outputDir, 'captures');
    const finalEnrichmentStoreDir = join(paths.outputDir, 'enrichments');
    const finalGoldStoreDir = join(paths.outputDir, 'gold');
    const finalPolicyFile = join(paths.outputDir, 'job-policy.json');
    const finalPlanFile = join(paths.outputDir, 'pilot-plan.json');
    const finalLedgerFile = join(paths.outputDir, 'provider-ledger.jsonl');
    const secretInstalled = existsSync(apiKeyFile);
    if (secretInstalled) inspectProviderApiKeyFile(apiKeyFile);
    const status: UnlockPackManifest['status'] = secretInstalled
      ? 'ready_for_authorization_request'
      : 'awaiting_secret_install';

    const manifest: UnlockPackManifest = {
      schemaVersion: 'doccanvas-enrichment-unlock-pack-v1',
      generatedAt: now,
      status,
      evidenceGrade: 'L2-fixture-or-dry-run',
      providerCall: false,
      ledgerWrite: false,
      authorizationGranted: false,
      providerId,
      modelId: profile.modelId,
      modelSelection: {
        observedAt: now,
        modelSource: profile.modelSource,
        apiSupportSource: profile.apiSupportSource,
        rationale: profile.rationale,
        inferenceMode: profile.inferenceMode,
      },
      policyHash: loadedPolicy.policyHash,
      planHash: loadedPlan.planHash,
      secretExpectedPath: apiKeyFile,
      cohort: {
        documentCounts: { 'vibe-track': 6, 'v2-pro': 7, 'playbook-v2': 7 },
        items: cohortItems,
      },
      nextAction: secretInstalled
        ? 'generate_authorization_request'
        : 'install_api_key_file_then_generate_authorization_request',
    };
    writeCreateOnly(join(staging, 'pack-manifest.json'), json(manifest));

    const receiptTemplate = {
      schemaVersion: 'doccanvas-enrichment-stage-authorization-template-v1',
      evidenceGrade: 'L2-fixture-or-dry-run',
      authorizationGranted: false,
      requiredOperatorFields: ['authorizedBy', 'authorizedAt', 'validUntil'],
      receipt: {
        schemaVersion: 'doccanvas-enrichment-stage-authorization-v1',
        authorizationId: `authorization.canary.unlock.${id}`,
        pilotId: loadedPlan.plan.pilotId,
        pilotPlanHash: loadedPlan.planHash,
        jobPolicyHash: loadedPolicy.policyHash,
        stage: 'canary',
        authorizedBy: null,
        authorizedAt: null,
        validUntil: null,
        expectedReservedCalls: 0,
        maxNewCalls: 1,
        allowedCaptureIds: [captureIds[0]],
      },
    };
    writeCreateOnly(join(staging, 'canary-stage-authorization.template.json'), json(receiptTemplate));

    const envLines = [
      '# Generated DocCanvas one-time pilot environment. Contains paths, never secret content.',
      `export DOCCANVAS_ENRICHMENT_MODE=${shellQuote('provider')}`,
      `export DOCCANVAS_ENRICHMENT_PROVIDER=${shellQuote(providerId)}`,
      `export DOCCANVAS_ENRICHMENT_MODEL=${shellQuote(profile.modelId)}`,
      `export DOCCANVAS_ENRICHMENT_JOB_POLICY_FILE=${shellQuote(finalPolicyFile)}`,
      `export DOCCANVAS_ENRICHMENT_API_KEY_FILE=${shellQuote(apiKeyFile)}`,
      `export DOCCANVAS_ENRICHMENT_LEDGER_PATH=${shellQuote(finalLedgerFile)}`,
      `export DOCCANVAS_ENRICHMENT_PILOT_PLAN_FILE=${shellQuote(finalPlanFile)}`,
      `export DOCCANVAS_CAPTURE_STORE_PATH=${shellQuote(finalCaptureStoreDir)}`,
      `export DOCCANVAS_ENRICHMENT_STORE_PATH=${shellQuote(finalEnrichmentStoreDir)}`,
      `export DOCCANVAS_ENRICHMENT_GOLD_PATH=${shellQuote(finalGoldStoreDir)}`,
      '',
      '# After exact canary approval, create a new stage-authorization.json and export:',
      `# export DOCCANVAS_ENRICHMENT_STAGE_AUTHORIZATION_FILE=${shellQuote(join(paths.outputDir, 'stage-authorization.json'))}`,
      '',
    ];
    writeCreateOnly(join(staging, 'operator-env.sh'), envLines.join('\n'));

    renameSync(staging, paths.outputDir);
    return {
      outputDir: paths.outputDir,
      status,
      evidenceGrade: 'L2-fixture-or-dry-run',
      providerCall: false,
      ledgerWrite: false,
      authorizationGranted: false,
      providerId,
      modelId: profile.modelId,
      policyHash: loadedPolicy.policyHash,
      planHash: loadedPlan.planHash,
      captureIds,
    };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
