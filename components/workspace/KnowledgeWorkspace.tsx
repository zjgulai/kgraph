'use client';

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { WritePolicy } from '@/lib/server/write-guard';
import type { DocumentEntry } from '@/lib/shared/document-registry';
import type { KnowledgeLibraryProjection } from '@/lib/knowledge/library-types';
import { filterKnowledgeItems } from '@/lib/knowledge/library-filter';
import { sortKnowledgeItems } from '@/lib/knowledge/library-view';
import {
  DEFAULT_WORKBENCH_ROUTE,
  parseWorkbenchRoute,
  toCanvasObject,
  toArtifact,
  toKnowledgeObject,
  toProductTask,
  toReviewObject,
  withBlueprint,
  withEvidenceRecord,
  withKnowledgeFilters,
  withKnowledgeLibraryView,
  withKnowledgeObject,
  withWorkbenchView,
  workbenchHref,
  type WorkbenchRoute,
  type WorkbenchView,
} from '@/lib/workbench/routes';
import {
  shouldBlockWorkbenchNavigation,
  type WorkbenchDirtyRegistry,
} from '@/lib/workbench/draft-navigation';
import { WorkspaceDashboard } from '@/components/canvas/WorkspaceDashboard';
import { WorkbenchShell, type WorkbenchCountMap } from '@/components/workbench/WorkbenchShell';
import type { WorkbenchCommandItem } from '@/components/workbench/CommandPalette';
import { WorkQueue } from '@/components/workbench/WorkQueue';
import { KnowledgeInspector } from './KnowledgeInspector';
import { KnowledgeLibrary } from './KnowledgeLibrary';
import { SolutionStudioWorkspace } from './SolutionStudioWorkspace';
import { BlueprintWorkspace } from './BlueprintWorkspace';
import { ArtifactWorkspace } from './ArtifactWorkspace';
import { WorkflowWorkspace } from './WorkflowWorkspace';
import { TimelineWorkspace } from './TimelineWorkspace';
import { EvolutionCockpit } from './EvolutionCockpit';
import { EvidenceRegistryWorkspace } from './EvidenceRegistryWorkspace';
import type { ProductOperationsProjection } from '@/lib/product/operations-projection';
import { CaptureWorkspace } from './CaptureWorkspace';
import type { CaptureSummary } from '@/lib/server/knowledge-capture-store';
import { EnrichmentWorkspace } from './EnrichmentWorkspace';
import type { EnrichmentSummary } from '@/lib/server/knowledge-enrichment-store';
import type { EnrichmentEvaluationReport, GoldAnnotationSummary } from '@/lib/server/knowledge-enrichment-eval';
import type { PilotReadinessReport } from '@/lib/server/knowledge-enrichment-pilot';
import { recordClientPerformance, startClientPerformanceObservers } from '@/lib/client/performance-telemetry';

function WorkspaceSurfaceLoading({ label }: { label: string }) {
  return <section className="workspace-surface-loading" role="status" aria-live="polite">正在加载{label}…</section>;
}

const KnowledgeReviewWorkspace = dynamic(
  () => import('./KnowledgeReviewWorkspace').then(module => module.KnowledgeReviewWorkspace),
  { loading: () => <WorkspaceSurfaceLoading label="Review 工作区" />, ssr: false },
);

const KnowledgeCanvasWorkspace = dynamic(
  () => import('./KnowledgeCanvasWorkspace').then(module => module.KnowledgeCanvasWorkspace),
  { loading: () => <WorkspaceSurfaceLoading label="Knowledge Canvas" />, ssr: false },
);

const ProviderOperationsWorkspace = dynamic(
  () => import('./ProviderOperationsWorkspace').then(module => module.ProviderOperationsWorkspace),
  { loading: () => <WorkspaceSurfaceLoading label="Provider Ops" />, ssr: false },
);

interface Props {
  initialLibrary: KnowledgeLibraryProjection;
  initialOperations: ProductOperationsProjection;
  initialEntries: DocumentEntry[];
  initialCaptures: CaptureSummary[];
  initialEnrichments?: EnrichmentSummary[];
  initialGold?: GoldAnnotationSummary[];
  initialEnrichmentEvaluation?: EnrichmentEvaluationReport;
  initialPilotReadiness?: PilotReadinessReport;
  initialRoute?: WorkbenchRoute;
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

function cloneDefaultRoute(): WorkbenchRoute {
  return {
    ...DEFAULT_WORKBENCH_ROUTE,
    filters: { ...DEFAULT_WORKBENCH_ROUTE.filters },
    libraryView: { ...DEFAULT_WORKBENCH_ROUTE.libraryView },
  };
}

export function KnowledgeWorkspace({
  initialLibrary,
  initialOperations,
  initialEntries,
  initialCaptures,
  initialEnrichments = [],
  initialGold = [],
  initialPilotReadiness,
  initialRoute = cloneDefaultRoute(),
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
  const [route, setRoute] = useState<WorkbenchRoute>(initialRoute);
  const [library, setLibrary] = useState(initialLibrary);
  const [captures, setCaptures] = useState(initialCaptures);
  const [operations, setOperations] = useState(initialOperations);
  const dirtyRegistryRef = useRef<WorkbenchDirtyRegistry>({});
  const pendingNavigationMetricRef = useRef<{ metric: 'surface-switch' | 'inspector-open'; startedAt: number } | null>(null);
  const deferredQuery = useDeferredValue(route.filters.query);
  const deferredFilters = useMemo(
    () => ({ ...route.filters, query: deferredQuery }),
    [deferredQuery, route.filters],
  );
  const filteredItems = useMemo(
    () => sortKnowledgeItems(filterKnowledgeItems(library.items, deferredFilters), route.libraryView.sort),
    [deferredFilters, library.items, route.libraryView.sort],
  );
  const selectedItem = (route.objectId ? filteredItems.find(item => item.objectId === route.objectId) : null)
    ?? filteredItems[0]
    ?? null;
  const selectedCapture = (route.captureId ? captures.find(capture => capture.captureId === route.captureId) : null)
    ?? (selectedItem ? captures.find(capture => capture.objectId === selectedItem.objectId) : null)
    ?? null;
  const selectedProductChain = operations.productChains.find(item => (
    item.taskId === route.taskId || item.blueprintId === route.blueprintId
  )) ?? null;

  const setWorkbenchDirty = useCallback((view: WorkbenchView, dirty: boolean) => {
    dirtyRegistryRef.current = { ...dirtyRegistryRef.current, [view]: dirty };
  }, []);

  const navigate = useCallback((next: WorkbenchRoute, mode: 'push' | 'replace' = 'push', skipDraftGuard = false) => {
    if (shouldBlockWorkbenchNavigation(route.view, next.view, dirtyRegistryRef.current, skipDraftGuard)
      && !window.confirm('当前工作区有未保存草稿，已保存在本地。仍要离开？')) return;
    if (next.view !== route.view || next.objectId !== route.objectId) {
      pendingNavigationMetricRef.current = {
        metric: next.view !== route.view ? 'surface-switch' : 'inspector-open',
        startedAt: performance.now(),
      };
    }
    setRoute(next);
    if (typeof window === 'undefined') return;
    window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', workbenchHref(next));
  }, [route.objectId, route.view]);

  useEffect(() => startClientPerformanceObservers(), []);

  useEffect(() => {
    if (route.view !== 'knowledge' || !selectedItem || route.objectId === selectedItem.objectId) return;
    navigate(withKnowledgeObject(route, selectedItem.objectId), 'replace');
  }, [navigate, route, selectedItem]);

  useEffect(() => {
    const pending = pendingNavigationMetricRef.current;
    if (!pending) return;
    const frame = window.requestAnimationFrame(() => {
      recordClientPerformance(pending.metric, performance.now() - pending.startedAt);
      if (pendingNavigationMetricRef.current === pending) pendingNavigationMetricRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route.objectId, route.view]);

  useEffect(() => {
    const restoreRoute = () => {
      const next = parseWorkbenchRoute(new URLSearchParams(window.location.search));
      if (shouldBlockWorkbenchNavigation(route.view, next.view, dirtyRegistryRef.current)
        && !window.confirm('当前工作区有未保存草稿，已保存在本地。仍要离开？')) {
        window.history.pushState(null, '', workbenchHref(route));
        return;
      }
      setRoute(next);
    };
    window.addEventListener('popstate', restoreRoute);
    return () => window.removeEventListener('popstate', restoreRoute);
  }, [route]);

  const refreshOperations = useCallback(async () => {
    const response = await fetch('/api/operations', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json() as ProductOperationsProjection & { error?: string };
    if (!response.ok || payload.schemaVersion !== 'doccanvas-product-operations-v1') throw new Error(payload.error || '运行投影刷新失败。');
    setOperations(payload);
  }, []);

  const counts = useMemo<WorkbenchCountMap>(() => ({
    work: operations.workflow.filter(stage => stage.state === 'active' || stage.state === 'blocked').length,
    knowledge: library.stats.total,
    capture: captures.length,
    enrichment: initialEnrichments.length,
    review: library.stats.reviewRequired,
    canvas: library.stats.domainCount,
    blueprints: operations.generatedFrom.blueprintCount,
    artifacts: operations.generatedFrom.artifactCount,
    workflow: operations.workflow.length,
    evidence: operations.evidenceRegistry.stats.total,
    provider: operations.providerOps.gates.filter(gate => gate.status !== 'pass').length,
    timeline: operations.timeline.valid.events.length
      + operations.timeline.observed.events.length
      + operations.timeline.governance.events.length,
    evolution: operations.evolution.checks.filter(check => check.status !== 'ready').length,
    documents: initialEntries.length,
  }), [captures.length, initialEnrichments.length, initialEntries.length, library.stats, operations]);

  const commandItems = useMemo<WorkbenchCommandItem[]>(() => [...library.items.map(item => {
    const target = withKnowledgeObject(withWorkbenchView(route, 'knowledge'), item.objectId);
    return {
      id: `knowledge:${item.objectId}`,
      label: item.title,
      description: item.summary,
      group: '知识对象',
      href: workbenchHref(target),
      route: target,
      keywords: [item.objectId, item.knowledgeForm, item.legacy.category, ...item.domainRefs],
    };
  }), ...operations.evidenceRegistry.items.map(item => {
    const target = withEvidenceRecord(route, item.evidenceId);
    return {
      id: `evidence:${item.evidenceId}`,
      label: item.title,
      description: `${item.summary} · ${item.freshness.status}`,
      group: '证据注册表',
      href: workbenchHref(target),
      route: target,
      keywords: [item.evidenceId, item.kind, item.state, item.source.ref],
    };
  })], [library.items, operations.evidenceRegistry.items, route]);

  const view = route.view;
  return (
    <WorkbenchShell route={route} counts={counts} commandItems={commandItems} onNavigate={navigate}>
      {view === 'work' ? (
        <WorkQueue route={route} projection={operations} onNavigate={navigate} />
      ) : view === 'knowledge' ? (
        <div className="knowledge-workspace__content">
          <div className="knowledge-workspace__surface">
            <KnowledgeLibrary
              allItems={library.items}
              items={filteredItems}
              filters={route.filters}
              viewState={route.libraryView}
              selectedId={selectedItem?.objectId ?? null}
              hrefForObject={objectId => workbenchHref(withKnowledgeObject(route, objectId))}
              onFiltersChange={filters => navigate(withKnowledgeFilters(route, filters), 'replace')}
              onViewStateChange={libraryView => navigate(withKnowledgeLibraryView(route, libraryView), 'replace')}
              onSelect={objectId => navigate(withKnowledgeObject(route, objectId))}
            />
            <KnowledgeInspector
              item={selectedItem}
              capture={selectedCapture}
              reviewHref={selectedItem ? workbenchHref(toReviewObject(route, selectedItem.objectId, selectedCapture?.captureId)) : null}
              canvasHref={selectedItem ? workbenchHref(toCanvasObject(route, selectedItem.objectId, selectedCapture?.captureId)) : null}
              onOpenReview={selectedItem ? () => navigate(toReviewObject(route, selectedItem.objectId, selectedCapture?.captureId)) : undefined}
              onOpenCanvas={selectedItem ? () => navigate(toCanvasObject(route, selectedItem.objectId, selectedCapture?.captureId)) : undefined}
            />
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
          onDirtyChange={dirty => setWorkbenchDirty('capture', dirty)}
          onOpenCandidate={(objectId, captureId) => navigate(toKnowledgeObject(route, objectId, captureId), 'push', true)}
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
            navigate(toKnowledgeObject(route, item.objectId, capture.captureId), 'push', true);
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
          onDirtyChange={dirty => setWorkbenchDirty('enrichment', dirty)}
        />
      ) : view === 'review' ? (
        <KnowledgeReviewWorkspace
          library={library}
          writePolicy={writePolicy}
          initialObjectId={route.objectId}
          onDirtyChange={dirty => setWorkbenchDirty('review', dirty)}
          onReviewObjectSelected={objectId => navigate(toReviewObject(route, objectId, route.captureId), 'replace')}
          onLibraryItemUpdated={updated => setLibrary(current => ({
            ...current,
            items: current.items.map(item => item.objectId === updated.objectId ? updated : item),
          }))}
          onSelectKnowledge={objectId => navigate(toKnowledgeObject(route, objectId, route.captureId), 'push', true)}
        />
      ) : view === 'canvas' ? (
        <KnowledgeCanvasWorkspace
          library={library}
          initialObjectId={route.objectId}
          onSelectKnowledge={objectId => navigate(toKnowledgeObject(route, objectId, route.captureId))}
        />
      ) : view === 'workflow' ? (
        <WorkflowWorkspace projection={operations} />
      ) : view === 'timeline' ? (
        <TimelineWorkspace
          projection={operations}
          initialAxis={route.tab}
          onAxisChange={axis => navigate({ ...route, tab: axis }, 'replace')}
          onEvidenceSelected={evidenceId => navigate(withEvidenceRecord(route, evidenceId))}
        />
      ) : view === 'evidence' ? (
        <EvidenceRegistryWorkspace
          projection={operations}
          initialEvidenceId={route.evidenceId}
          hrefForEvidence={evidenceId => workbenchHref(withEvidenceRecord(route, evidenceId))}
          onEvidenceSelected={evidenceId => navigate(withEvidenceRecord(route, evidenceId))}
        />
      ) : view === 'provider' ? (
        <ProviderOperationsWorkspace projection={operations} />
      ) : view === 'solutions' ? (
        <SolutionStudioWorkspace
          library={library}
          writePolicy={writePolicy}
          chains={operations.productChains}
          initialTaskId={route.taskId}
          onDirtyChange={dirty => setWorkbenchDirty('solutions', dirty)}
          onTaskSelected={(taskId, blueprintId) => navigate(toProductTask(route, taskId, blueprintId))}
          onBlueprintSaved={(blueprintId, taskId) => navigate(withBlueprint(toProductTask(route, taskId, blueprintId), blueprintId))}
        />
      ) : view === 'blueprints' ? (
        <BlueprintWorkspace
          writePolicy={writePolicy}
          initialBlueprintId={route.blueprintId}
          initialRevision={route.revision}
          chain={selectedProductChain}
          onDirtyChange={dirty => setWorkbenchDirty('blueprints', dirty)}
          onBlueprintSelected={blueprintId => {
            const chain = operations.productChains.find(item => item.blueprintId === blueprintId);
            navigate(withBlueprint(chain ? toProductTask(route, chain.taskId, blueprintId) : route, blueprintId));
          }}
          onArtifactCompiled={() => void refreshOperations()}
        />
      ) : view === 'artifacts' ? (
        <ArtifactWorkspace
          projection={operations}
          initialArtifactKey={route.artifactKey}
          initialView={route.tab}
          onTaskSelected={(taskId, blueprintId) => navigate(toProductTask(route, taskId, blueprintId))}
          onBlueprintSelected={blueprintId => {
            const chain = operations.productChains.find(item => item.blueprintId === blueprintId);
            navigate(withBlueprint(chain ? toProductTask(route, chain.taskId, blueprintId) : route, blueprintId));
          }}
          onArtifactRouteChange={(blueprintId, artifactKey, tab) => {
            const chain = operations.productChains.find(item => item.blueprintId === blueprintId);
            const base = chain ? toProductTask(route, chain.taskId, blueprintId) : route;
            navigate(toArtifact(base, blueprintId, artifactKey, tab), 'replace');
          }}
        />
      ) : view === 'evolution' ? (
        <EvolutionCockpit projection={operations} />
      ) : (
        <WorkspaceDashboard initialEntries={initialEntries} writePolicy={writePolicy} embedded />
      )}
    </WorkbenchShell>
  );
}
