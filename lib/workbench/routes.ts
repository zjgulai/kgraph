import {
  DEFAULT_KNOWLEDGE_LIBRARY_VIEW,
  EMPTY_KNOWLEDGE_FILTERS,
  type KnowledgeLibraryFilters,
  type KnowledgeLibraryViewState,
} from '../knowledge/library-types';

export type WorkbenchArea = 'knowledge' | 'product' | 'operations' | 'sources';
export type WorkbenchView =
  | 'work'
  | 'knowledge'
  | 'capture'
  | 'enrichment'
  | 'review'
  | 'canvas'
  | 'solutions'
  | 'blueprints'
  | 'artifacts'
  | 'workflow'
  | 'evidence'
  | 'provider'
  | 'timeline'
  | 'evolution'
  | 'documents';

export interface WorkbenchRoute {
  area: WorkbenchArea;
  view: WorkbenchView;
  objectId: string | null;
  captureId: string | null;
  taskId: string | null;
  blueprintId: string | null;
  artifactKey: string | null;
  evidenceId: string | null;
  revision: number | null;
  tab: string | null;
  filters: KnowledgeLibraryFilters;
  libraryView: KnowledgeLibraryViewState;
}

interface SearchParamsReader {
  get(name: string): string | null;
}

export const WORKBENCH_VIEW_AREA: Readonly<Record<WorkbenchView, WorkbenchArea>> = {
  work: 'operations',
  knowledge: 'knowledge',
  capture: 'knowledge',
  enrichment: 'knowledge',
  review: 'knowledge',
  canvas: 'knowledge',
  solutions: 'product',
  blueprints: 'product',
  artifacts: 'product',
  workflow: 'operations',
  evidence: 'operations',
  provider: 'operations',
  timeline: 'operations',
  evolution: 'operations',
  documents: 'sources',
};

const WORKBENCH_VIEWS = new Set<WorkbenchView>(Object.keys(WORKBENCH_VIEW_AREA) as WorkbenchView[]);
const KNOWLEDGE_VIEWS = new Set<WorkbenchView>(['knowledge', 'capture', 'enrichment', 'review', 'canvas']);
const PRODUCT_VIEWS = new Set<WorkbenchView>(['solutions', 'blueprints', 'artifacts']);
const OPERATIONS_VIEWS = new Set<WorkbenchView>(['work', 'workflow', 'evidence', 'provider', 'timeline', 'evolution']);

export const DEFAULT_WORKBENCH_ROUTE: Readonly<WorkbenchRoute> = Object.freeze({
  area: 'operations',
  view: 'work',
  objectId: null,
  captureId: null,
  taskId: null,
  blueprintId: null,
  artifactKey: null,
  evidenceId: null,
  revision: null,
  tab: null,
  filters: Object.freeze({ ...EMPTY_KNOWLEDGE_FILTERS }),
  libraryView: Object.freeze({ ...DEFAULT_KNOWLEDGE_LIBRARY_VIEW }),
});

function cleanParam(value: string | null, maxLength = 256): string | null {
  const cleaned = value?.trim() ?? '';
  return cleaned.length > 0 && cleaned.length <= maxLength ? cleaned : null;
}

function parseRevision(value: string | null): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

function parseView(value: string | null): WorkbenchView | null {
  return value && WORKBENCH_VIEWS.has(value as WorkbenchView) ? value as WorkbenchView : null;
}

function parseLibraryView(searchParams: SearchParamsReader): KnowledgeLibraryViewState {
  const sort = searchParams.get('sort');
  const density = searchParams.get('density');
  const layout = searchParams.get('layout');
  return {
    sort: sort === 'title' || sort === 'observed' || sort === 'revision' ? sort : 'relevance',
    density: density === 'compact' ? 'compact' : 'comfortable',
    layout: layout === 'grid' ? 'grid' : 'list',
  };
}

export function parseWorkbenchRoute(searchParams: SearchParamsReader): WorkbenchRoute {
  const view = parseView(searchParams.get('view'));
  if (!view) return {
    ...DEFAULT_WORKBENCH_ROUTE,
    filters: { ...DEFAULT_WORKBENCH_ROUTE.filters },
  };

  const knowledgeView = KNOWLEDGE_VIEWS.has(view);
  const productView = PRODUCT_VIEWS.has(view);
  const operationsView = OPERATIONS_VIEWS.has(view);
  return {
    area: WORKBENCH_VIEW_AREA[view],
    view,
    objectId: knowledgeView ? cleanParam(searchParams.get('object')) : null,
    captureId: knowledgeView ? cleanParam(searchParams.get('capture')) : null,
    taskId: productView ? cleanParam(searchParams.get('task')) : null,
    blueprintId: productView ? cleanParam(searchParams.get('blueprint')) : null,
    artifactKey: productView ? cleanParam(searchParams.get('artifact')) : null,
    evidenceId: operationsView ? cleanParam(searchParams.get('record')) : null,
    revision: cleanParam(searchParams.get('object')) || cleanParam(searchParams.get('blueprint'))
      ? parseRevision(searchParams.get('revision'))
      : null,
    tab: cleanParam(searchParams.get('tab'), 64),
    libraryView: knowledgeView ? parseLibraryView(searchParams) : { ...DEFAULT_KNOWLEDGE_LIBRARY_VIEW },
    filters: knowledgeView ? {
      query: cleanParam(searchParams.get('q')) ?? '',
      domain: cleanParam(searchParams.get('domain')) ?? '',
      knowledgeForm: cleanParam(searchParams.get('form')) ?? '',
      evidenceGrade: cleanParam(searchParams.get('evidence')) ?? '',
      assetMaturity: cleanParam(searchParams.get('maturity')) ?? '',
      lifecycle: cleanParam(searchParams.get('lifecycle')) ?? '',
    } : { ...EMPTY_KNOWLEDGE_FILTERS },
  };
}

function appendIfPresent(params: URLSearchParams, key: string, value: string | number | null) {
  if (value !== null && String(value).length > 0) params.set(key, String(value));
}

export function workbenchHref(route: WorkbenchRoute): string {
  const params = new URLSearchParams();
  params.set('area', WORKBENCH_VIEW_AREA[route.view]);
  params.set('view', route.view);
  appendIfPresent(params, 'object', route.objectId);
  appendIfPresent(params, 'capture', route.captureId);
  appendIfPresent(params, 'task', route.taskId);
  appendIfPresent(params, 'blueprint', route.blueprintId);
  appendIfPresent(params, 'artifact', route.artifactKey);
  appendIfPresent(params, 'record', route.evidenceId);
  appendIfPresent(params, 'revision', route.revision);
  appendIfPresent(params, 'tab', route.tab);
  appendIfPresent(params, 'q', route.filters.query);
  appendIfPresent(params, 'domain', route.filters.domain);
  appendIfPresent(params, 'form', route.filters.knowledgeForm);
  appendIfPresent(params, 'evidence', route.filters.evidenceGrade);
  appendIfPresent(params, 'maturity', route.filters.assetMaturity);
  appendIfPresent(params, 'lifecycle', route.filters.lifecycle);
  if (route.view === 'knowledge') {
    params.set('sort', route.libraryView.sort);
    params.set('density', route.libraryView.density);
    params.set('layout', route.libraryView.layout);
  }
  return `/?${params.toString()}`;
}

export function withWorkbenchView(route: WorkbenchRoute, view: WorkbenchView): WorkbenchRoute {
  const keepKnowledgeState = KNOWLEDGE_VIEWS.has(route.view) && KNOWLEDGE_VIEWS.has(view);
  const keepProductState = PRODUCT_VIEWS.has(route.view) && PRODUCT_VIEWS.has(view);
  const keepOperationsState = OPERATIONS_VIEWS.has(route.view) && OPERATIONS_VIEWS.has(view);
  return {
    area: WORKBENCH_VIEW_AREA[view],
    view,
    objectId: keepKnowledgeState ? route.objectId : null,
    captureId: keepKnowledgeState ? route.captureId : null,
    taskId: keepProductState ? route.taskId : null,
    blueprintId: keepProductState ? route.blueprintId : null,
    artifactKey: keepProductState ? route.artifactKey : null,
    evidenceId: keepOperationsState ? route.evidenceId : null,
    revision: keepKnowledgeState || keepProductState ? route.revision : null,
    tab: keepOperationsState ? route.tab : null,
    filters: keepKnowledgeState ? { ...route.filters } : { ...EMPTY_KNOWLEDGE_FILTERS },
    libraryView: keepKnowledgeState ? { ...route.libraryView } : { ...DEFAULT_KNOWLEDGE_LIBRARY_VIEW },
  };
}

export function withEvidenceRecord(route: WorkbenchRoute, evidenceId: string | null): WorkbenchRoute {
  return {
    ...withWorkbenchView(route, 'evidence'),
    evidenceId,
  };
}

export function withKnowledgeFilters(
  route: WorkbenchRoute,
  filters: KnowledgeLibraryFilters,
): WorkbenchRoute {
  return {
    ...route,
    area: 'knowledge',
    view: 'knowledge',
    filters: { ...filters },
  };
}

export function withKnowledgeLibraryView(
  route: WorkbenchRoute,
  libraryView: KnowledgeLibraryViewState,
): WorkbenchRoute {
  return {
    ...route,
    area: 'knowledge',
    view: 'knowledge',
    libraryView: { ...libraryView },
  };
}

export function withKnowledgeObject(route: WorkbenchRoute, objectId: string | null): WorkbenchRoute {
  return {
    ...route,
    area: 'knowledge',
    view: 'knowledge',
    objectId,
    captureId: objectId === route.objectId ? route.captureId : null,
    revision: null,
  };
}

function toKnowledgeDestination(
  route: WorkbenchRoute,
  view: Extract<WorkbenchView, 'knowledge' | 'review' | 'canvas'>,
  objectId: string,
  captureId: string | null = route.captureId,
): WorkbenchRoute {
  return {
    ...withWorkbenchView(route, view),
    area: 'knowledge',
    view,
    objectId,
    captureId,
    revision: null,
  };
}

export function toKnowledgeObject(route: WorkbenchRoute, objectId: string, captureId?: string | null): WorkbenchRoute {
  return toKnowledgeDestination(route, 'knowledge', objectId, captureId);
}

export function toReviewObject(route: WorkbenchRoute, objectId: string, captureId?: string | null): WorkbenchRoute {
  return toKnowledgeDestination(route, 'review', objectId, captureId);
}

export function toCanvasObject(route: WorkbenchRoute, objectId: string, captureId?: string | null): WorkbenchRoute {
  return toKnowledgeDestination(route, 'canvas', objectId, captureId);
}

export function withBlueprint(route: WorkbenchRoute, blueprintId: string | null): WorkbenchRoute {
  return {
    ...withWorkbenchView(route, 'blueprints'),
    blueprintId,
    artifactKey: null,
    revision: null,
  };
}

export function toProductTask(route: WorkbenchRoute, taskId: string, blueprintId: string | null = null): WorkbenchRoute {
  return {
    ...withWorkbenchView(route, 'solutions'),
    taskId,
    blueprintId,
    artifactKey: null,
    revision: null,
  };
}

export function toArtifact(
  route: WorkbenchRoute,
  blueprintId: string,
  artifactKey: string,
  tab: string | null = 'prd',
): WorkbenchRoute {
  return {
    ...withWorkbenchView(route, 'artifacts'),
    blueprintId,
    artifactKey,
    tab,
    revision: null,
  };
}
