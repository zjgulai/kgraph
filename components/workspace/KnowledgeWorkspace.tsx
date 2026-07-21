'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bot,
  BookOpenText,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  Command,
  FileInput,
  FileStack,
  GitBranch,
  History,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { WritePolicy } from '@/lib/server/write-guard';
import type { DocumentEntry } from '@/lib/shared/document-registry';
import {
  EMPTY_KNOWLEDGE_FILTERS,
  type KnowledgeLibraryFilters,
  type KnowledgeLibraryProjection,
} from '@/lib/knowledge/library-types';
import { filterKnowledgeItems } from '@/lib/knowledge/library-filter';
import { WorkspaceDashboard } from '@/components/canvas/WorkspaceDashboard';
import { KnowledgeInspector } from './KnowledgeInspector';
import { KnowledgeLibrary } from './KnowledgeLibrary';
import { KnowledgeReviewWorkspace } from './KnowledgeReviewWorkspace';
import { KnowledgeCanvasWorkspace } from './KnowledgeCanvasWorkspace';
import { SolutionStudioWorkspace } from './SolutionStudioWorkspace';
import { BlueprintWorkspace } from './BlueprintWorkspace';
import { ArtifactWorkspace } from './ArtifactWorkspace';
import { WorkflowWorkspace } from './WorkflowWorkspace';
import { TimelineWorkspace } from './TimelineWorkspace';
import { EvolutionCockpit } from './EvolutionCockpit';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';
import { CaptureWorkspace } from './CaptureWorkspace';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import { EnrichmentWorkspace } from './EnrichmentWorkspace';
import type { EnrichmentSummary } from '@/lib/server/knowledge-enrichment-store';
import type { EnrichmentEvaluationReport, GoldAnnotationSummary } from '@/lib/server/knowledge-enrichment-eval';
import type { PilotReadinessReport } from '@/lib/server/knowledge-enrichment-pilot';

interface Props {
  initialLibrary: KnowledgeLibraryProjection;
  initialOperations: ProductOperationsProjection;
  initialEntries: DocumentEntry[];
  initialCaptures: CaptureSummary[];
  initialEnrichments?: EnrichmentSummary[];
  initialGold?: GoldAnnotationSummary[];
  initialEnrichmentEvaluation?: EnrichmentEvaluationReport;
  initialPilotReadiness?: PilotReadinessReport;
  enrichmentRuntime?: {
    mode: 'disabled' | 'configured'; providerId: string | null; modelId: string | null; ready: boolean; reason: string;
    jobId?: string; policyHash?: string;
    budget?: {
      maxCalls: number;
      reservedCalls: number;
      remainingCalls: number;
      providerCompletedCalls: number;
      providerFailedCalls: number;
    };
  };
  writePolicy: WritePolicy;
}

type WorkspaceView = 'knowledge' | 'capture' | 'enrichment' | 'review' | 'canvas' | 'workflow' | 'timeline' | 'solutions' | 'blueprints' | 'artifacts' | 'evolution' | 'documents';

const viewContext: Record<WorkspaceView, { title: string; mode: string }> = {
  knowledge: { title: '知识资产与治理工作台', mode: 'Knowledge / Library' },
  capture: { title: '来源快照与候选生成工作台', mode: 'Capture / Evidence intake' },
  enrichment: { title: '生成式萃取与人工金标实验室', mode: 'Enrichment / Human-gold eval' },
  review: { title: '候选证据与修订工作台', mode: 'Review / Candidate governance' },
  canvas: { title: '知识对象空间关系工作台', mode: 'Canvas / Spatial projection' },
  workflow: { title: '证据链与产品流程工作台', mode: 'Workflow / Evidence state' },
  timeline: { title: '双时态知识账本', mode: 'Timeline / Bitemporal ledger' },
  solutions: { title: '证据驱动方案工作台', mode: 'Solutions / Evidence-bound scaffold' },
  blueprints: { title: 'Blueprint 修订与编译工作台', mode: 'Blueprints / Governed compiler' },
  artifacts: { title: '已验证规格与编译视图', mode: 'Artifacts / Compiled views' },
  evolution: { title: '进化证据与数字员工工作台', mode: 'Evolution / Candidate only' },
  documents: { title: '源文档与关系画布', mode: 'Documents / Canvas' },
};

export function KnowledgeWorkspace({
  initialLibrary,
  initialOperations,
  initialEntries,
  initialCaptures,
  initialEnrichments = [],
  initialGold = [],
  initialPilotReadiness,
  initialEnrichmentEvaluation = {
    schemaVersion: 'doccanvas-enrichment-eval-report-v1',
    status: 'insufficient_data',
    sampleCount: 0,
    minimumSamples: 20,
    policy: {
      minimumSamples: 20,
      minimumClassificationExactMatch: .9,
      minimumTitleTokenF1: .7,
      minimumSummaryTokenF1: .7,
      minimumKeyPointCoverage: .7,
      maximumInvalidEvidenceLocatorRate: 0,
      maximumSchemaFailureRate: 0,
    },
    metrics: {
      classificationExactMatch: 0, titleTokenF1: 0, summaryTokenF1: 0,
      keyPointCoverage: 0, invalidEvidenceLocatorRate: 0, schemaFailureRate: 0,
    },
    gates: [
      { metric: 'classificationExactMatch', operator: 'minimum', threshold: .9, actual: 0, passed: false },
      { metric: 'titleTokenF1', operator: 'minimum', threshold: .7, actual: 0, passed: false },
      { metric: 'summaryTokenF1', operator: 'minimum', threshold: .7, actual: 0, passed: false },
      { metric: 'keyPointCoverage', operator: 'minimum', threshold: .7, actual: 0, passed: false },
      { metric: 'invalidEvidenceLocatorRate', operator: 'maximum', threshold: 0, actual: 0, passed: true },
      { metric: 'schemaFailureRate', operator: 'maximum', threshold: 0, actual: 0, passed: true },
    ],
    samples: [],
  },
  enrichmentRuntime = { mode: 'disabled', providerId: null, modelId: null, ready: false, reason: 'disabled_by_policy' },
  writePolicy,
}: Props) {
  const [view, setView] = useState<WorkspaceView>('knowledge');
  const [library, setLibrary] = useState(initialLibrary);
  const [captures, setCaptures] = useState(initialCaptures);
  const [operations, setOperations] = useState(initialOperations);
  const [filters, setFilters] = useState<KnowledgeLibraryFilters>(EMPTY_KNOWLEDGE_FILTERS);
  const [selectedId, setSelectedId] = useState(initialLibrary.items[0]?.objectId ?? null);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(filters.query);
  const deferredFilters = useMemo(() => ({ ...filters, query: deferredQuery }), [deferredQuery, filters]);
  const filteredItems = useMemo(
    () => filterKnowledgeItems(library.items, deferredFilters),
    [deferredFilters, library.items],
  );
  const selectedItem = filteredItems.find(item => item.objectId === selectedId) ?? filteredItems[0] ?? null;
  const refreshOperations = useCallback(async () => {
    const response = await fetch('/api/operations', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json() as ProductOperationsProjection & { error?: string };
    if (!response.ok || payload.schemaVersion !== 'doccanvas-product-operations-v1') throw new Error(payload.error || '运行投影刷新失败。');
    setOperations(payload);
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (view !== 'knowledge' || event.key.toLocaleLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [view]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view]);

  return (
    <main className="knowledge-workspace">
      <aside className="knowledge-workspace__rail" aria-label="产品工作区导航">
        <div className="knowledge-workspace__brand">
          <span><BrainCircuit aria-hidden="true" /></span>
          <div><strong>DocCanvas</strong><small>KNOWLEDGE OS</small></div>
        </div>
        <nav>
          <button type="button" data-active={view === 'knowledge'} onClick={() => setView('knowledge')}>
            <BookOpenText aria-hidden="true" /><span>Knowledge</span><b>{library.stats.total}</b>
          </button>
          <button type="button" data-active={view === 'capture'} onClick={() => setView('capture')}>
            <FileInput aria-hidden="true" /><span>Capture</span><b>{captures.length}</b>
          </button>
          <button type="button" data-active={view === 'enrichment'} onClick={() => setView('enrichment')}>
            <Bot aria-hidden="true" /><span>Enrichment</span><b>{initialEnrichments.length}</b>
          </button>
          <button type="button" data-active={view === 'review'} onClick={() => setView('review')}>
            <ClipboardCheck aria-hidden="true" /><span>Review</span><b>{library.stats.reviewRequired}</b>
          </button>
          <button type="button" data-active={view === 'canvas'} onClick={() => setView('canvas')}>
            <Network aria-hidden="true" /><span>Canvas</span><b>{library.stats.domainCount}</b>
          </button>
          <button type="button" data-active={view === 'workflow'} onClick={() => setView('workflow')}>
            <Workflow aria-hidden="true" /><span>Workflow</span><b>{operations.workflow.length}</b>
          </button>
          <button type="button" data-active={view === 'timeline'} onClick={() => setView('timeline')}>
            <History aria-hidden="true" /><span>Timeline</span><b>{operations.timeline.governance.events.length}</b>
          </button>
          <button type="button" data-active={view === 'solutions'} onClick={() => setView('solutions')}>
            <Sparkles aria-hidden="true" /><span>Solutions</span><b>04</b>
          </button>
          <button type="button" data-active={view === 'blueprints'} onClick={() => setView('blueprints')}>
            <Workflow aria-hidden="true" /><span>Blueprints</span><b>05</b>
          </button>
          <button type="button" data-active={view === 'artifacts'} onClick={() => setView('artifacts')}>
            <Archive aria-hidden="true" /><span>Artifacts</span><b>{operations.artifacts.length}</b>
          </button>
          <button type="button" data-active={view === 'evolution'} onClick={() => setView('evolution')}>
            <GitBranch aria-hidden="true" /><span>Evolution</span><b>{operations.evolution.checks.filter(check => check.status !== 'ready').length}</b>
          </button>
          <button type="button" data-active={view === 'documents'} onClick={() => setView('documents')}>
            <FileStack aria-hidden="true" /><span>Documents</span><b>{initialEntries.length}</b>
          </button>
        </nav>
        <div className="knowledge-workspace__boundary">
          <ShieldCheck aria-hidden="true" />
          <p><strong>Candidate only</strong><span>本视图不执行 canonical promotion</span></p>
        </div>
      </aside>

      <section className="knowledge-workspace__main">
        <header className="knowledge-commandbar">
          <div className="knowledge-commandbar__context">
            <Command aria-hidden="true" />
            <div><small>Knowledge Product Workspace</small><strong>{viewContext[view].title}</strong></div>
          </div>
          {view === 'knowledge' ? (
            <label className="knowledge-commandbar__search">
              <Search aria-hidden="true" />
              <span className="sr-only">搜索知识对象</span>
              <input
                ref={searchInputRef}
                type="search"
                aria-label="搜索知识对象"
                value={filters.query}
                onChange={event => setFilters(current => ({ ...current, query: event.target.value }))}
                placeholder="搜索工具、领域、推荐语境…"
                autoComplete="off"
              />
              <kbd>⌘ K</kbd>
            </label>
          ) : (
            <p className="knowledge-commandbar__mode"><Boxes aria-hidden="true" />{viewContext[view].mode}</p>
          )}
        </header>

        {view === 'knowledge' ? (
          <div className="knowledge-workspace__content">
            <section className="knowledge-overview" aria-labelledby="knowledge-overview-title">
              <div>
                <span>CONTROL SURFACE / 01</span>
                <h1 id="knowledge-overview-title">把零散经验变成<br />可审计的产品能力</h1>
                <p>这里不是另一份工具清单。每个对象都携带来源、双时态、证据等级和人工门，之后才进入方案、Blueprint 与生产编译。</p>
              </div>
              <dl>
                <div><dt>候选对象</dt><dd>{library.stats.total}</dd><small>等待治理的知识资产</small></div>
                <div><dt>人工复核</dt><dd>{library.stats.reviewRequired}</dd><small>尚未获得 canonical 身份</small></div>
                <div><dt>QA 警告</dt><dd>{library.stats.warningCount}</dd><small>保留不确定性，不伪造事实</small></div>
                <div><dt>领域切面</dt><dd>{library.stats.domainCount}</dd><small>可组合进入产品能力</small></div>
              </dl>
            </section>

            <div className="knowledge-workspace__surface">
              <KnowledgeLibrary
                allItems={library.items}
                items={filteredItems}
                filters={filters}
                selectedId={selectedItem?.objectId ?? null}
                onFiltersChange={setFilters}
                onSelect={setSelectedId}
              />
              <KnowledgeInspector item={selectedItem} />
            </div>
            <footer className="knowledge-workspace__provenance">
              <span>PACK</span><code>{library.source.packHash}</code>
              <span>SOURCE</span><code>{library.source.sourceHash}</code>
            </footer>
          </div>
        ) : view === 'capture' ? (
          <CaptureWorkspace
            captures={captures}
            writePolicy={writePolicy}
            onCandidateCreated={(item, capture) => {
              setCaptures(current => [capture, ...current.filter(existing => existing.captureId !== capture.captureId)]);
              setLibrary(current => {
                const items = [item, ...current.items.filter(existing => existing.objectId !== item.objectId)];
                return {
                  ...current,
                  stats: {
                    ...current.stats,
                    total: items.length,
                    reviewRequired: items.filter(candidate => candidate.promotionState === 'human_review_required').length,
                    warningCount: items.reduce((total, candidate) => total + candidate.warningCodes.length, 0),
                    domainCount: new Set(items.flatMap(candidate => candidate.domainRefs)).size,
                    lifecycleReview: items.filter(candidate => candidate.legacy.status !== 'active').length,
                  },
                  items,
                };
              });
              setSelectedId(item.objectId);
              void refreshOperations();
            }}
          />
        ) : view === 'enrichment' ? (
          <EnrichmentWorkspace
            captures={captures}
            initialEnrichments={initialEnrichments}
            initialGold={initialGold}
            runtime={enrichmentRuntime}
            evaluation={initialEnrichmentEvaluation}
            pilot={initialPilotReadiness}
            writePolicy={writePolicy}
          />
        ) : view === 'review' ? (
          <KnowledgeReviewWorkspace
            library={library}
            writePolicy={writePolicy}
            onLibraryItemUpdated={updated => setLibrary(current => ({
              ...current,
              items: current.items.map(item => item.objectId === updated.objectId ? updated : item),
            }))}
            onSelectKnowledge={objectId => {
              setSelectedId(objectId);
              setView('knowledge');
            }}
          />
        ) : view === 'canvas' ? (
          <KnowledgeCanvasWorkspace
            library={library}
            onSelectKnowledge={objectId => {
              setSelectedId(objectId);
              setView('knowledge');
            }}
          />
        ) : view === 'workflow' ? (
          <WorkflowWorkspace projection={operations} />
        ) : view === 'timeline' ? (
          <TimelineWorkspace projection={operations} />
        ) : view === 'solutions' ? (
          <SolutionStudioWorkspace
            library={library}
            writePolicy={writePolicy}
            onBlueprintSaved={blueprintId => {
              setSelectedBlueprintId(blueprintId);
              setView('blueprints');
            }}
          />
        ) : view === 'blueprints' ? (
          <BlueprintWorkspace writePolicy={writePolicy} initialBlueprintId={selectedBlueprintId} onArtifactCompiled={() => void refreshOperations()} />
        ) : view === 'artifacts' ? (
          <ArtifactWorkspace projection={operations} />
        ) : view === 'evolution' ? (
          <EvolutionCockpit projection={operations} />
        ) : (
          <WorkspaceDashboard initialEntries={initialEntries} writePolicy={writePolicy} embedded />
        )}
      </section>
    </main>
  );
}
