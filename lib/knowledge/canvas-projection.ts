import type {
  ArchitectureLayoutEdge,
  ArchitectureLayoutNode,
  ArchitectureLayoutResult,
} from '../canvas/layout-engine';
import { routeOrthogonalEdge, type OrthogonalRelation, type OrthogonalRectangle } from '../canvas/orthogonal-router';
import type { KnowledgeLibraryItem, KnowledgeRelationRef, KnowledgeRelationType } from './library-types';

const GROUP_COLUMNS = 4;
const GROUP_WIDTH = 632;
const GROUP_GAP = 36;
const GROUP_PADDING = 24;
const GROUP_HEADER_HEIGHT = 76;
const CARD_COLUMNS = 2;
const CARD_WIDTH = 276;
const CARD_HEIGHT = 146;
// The orthogonal router reserves 18px for its exit lane and expands obstacles
// by 6px. A 32px gutter keeps those lanes clear between adjacent cards.
const CARD_GAP = 32;
const CANVAS_PADDING = 40;

const DOMAIN_PRESENTATION: Readonly<Record<string, { title: string; code: string }>> = {
  'ai-product.tooling.mcp': { title: 'Context & MCP', code: 'CONTEXT' },
  'ai-product.agent.frameworks': { title: 'Agent Orchestration', code: 'AGENTS' },
  'ai-product.knowledge.vector-store': { title: 'Vector Memory', code: 'MEMORY' },
  'ai-product.knowledge.embedding': { title: 'Embedding Models', code: 'EMBED' },
  'ai-product.knowledge.graph': { title: 'Knowledge Graph', code: 'GRAPH' },
  'ai-product.model.providers': { title: 'Model Fleet', code: 'MODELS' },
  'ai-product.delivery.deployment': { title: 'Delivery Systems', code: 'DELIVERY' },
  'ai-product.evaluation.tooling': { title: 'Quality Lab', code: 'EVAL' },
};

const RELATION_KIND: Readonly<Record<KnowledgeRelationType, OrthogonalRelation>> = {
  supports: 'resource',
  contradicts: 'governance',
  supersedes: 'flow',
  requires: 'dependency',
  alternative_to: 'governance',
  derived_from: 'flow',
  tested_by: 'resource',
  used_in: 'flow',
  blocks: 'dependency',
  optimizes_for: 'governance',
  observed_in: 'resource',
  context_depends_on: 'dependency',
};

export interface KnowledgeCanvasGroup {
  domainId: string;
  sceneNodeId: string;
  title: string;
  code: string;
  objectIds: string[];
}

export interface KnowledgeCanvasObject {
  objectId: string;
  sceneNodeId: string;
  domainId: string;
  item: KnowledgeLibraryItem;
}

export interface KnowledgeCanvasRelation {
  sceneEdgeId: string;
  sourceId: string;
  targetId: string;
  relationType: KnowledgeRelationType;
  rationale?: string;
  presentationKind: OrthogonalRelation;
}

export interface KnowledgeCanvasProjection {
  schemaVersion: 'doccanvas-knowledge-canvas-projection-v1';
  groups: KnowledgeCanvasGroup[];
  objects: KnowledgeCanvasObject[];
  relations: KnowledgeCanvasRelation[];
  layout: ArchitectureLayoutResult;
}

function primaryDomain(item: KnowledgeLibraryItem): string {
  const domain = [...item.domainRefs].sort((left, right) => left.localeCompare(right))[0];
  if (!domain) throw new Error(`KNOWLEDGE_CANVAS_DOMAIN_MISSING: ${item.objectId}`);
  return domain;
}

function domainPresentation(domainId: string): { title: string; code: string } {
  const known = DOMAIN_PRESENTATION[domainId];
  if (known) return known;
  const leaf = domainId.split('.').slice(-2).join(' / ');
  return { title: leaf, code: domainId.split('.').at(-1)?.slice(0, 10).toUpperCase() ?? 'DOMAIN' };
}

function groupSceneId(domainId: string): string {
  return `knowledge-domain:${domainId}`;
}

function objectSceneId(objectId: string): string {
  return `knowledge-object:${objectId}`;
}

function relationSortKey(sourceId: string, relation: KnowledgeRelationRef): string {
  return [sourceId, relation.relationType, relation.targetId, relation.rationale ?? ''].join('\u0000');
}

function absoluteRectangle(
  node: ArchitectureLayoutNode,
  groupById: ReadonlyMap<string, ArchitectureLayoutNode>,
): OrthogonalRectangle {
  const parent = node.parentId ? groupById.get(node.parentId) : undefined;
  return {
    id: node.id,
    x: node.position.x + (parent?.position.x ?? 0),
    y: node.position.y + (parent?.position.y ?? 0),
    width: node.width,
    height: node.height,
  };
}

export function buildKnowledgeCanvasProjection(input: readonly KnowledgeLibraryItem[]): KnowledgeCanvasProjection {
  const items = [...input].sort((left, right) => left.objectId.localeCompare(right.objectId));
  if (new Set(items.map(item => item.objectId)).size !== items.length) {
    throw new Error('KNOWLEDGE_CANVAS_OBJECT_ID_DUPLICATE');
  }
  const itemById = new Map(items.map(item => [item.objectId, item]));
  const grouped = new Map<string, KnowledgeLibraryItem[]>();
  for (const item of items) {
    const domainId = primaryDomain(item);
    grouped.set(domainId, [...(grouped.get(domainId) ?? []), item]);
  }

  const domains = [...grouped.keys()].sort((left, right) => left.localeCompare(right));
  const heights = domains.map(domainId => {
    const rows = Math.ceil((grouped.get(domainId)?.length ?? 0) / CARD_COLUMNS);
    return GROUP_HEADER_HEIGHT + GROUP_PADDING + rows * CARD_HEIGHT + Math.max(0, rows - 1) * CARD_GAP + GROUP_PADDING;
  });
  const rowOffsets: number[] = [];
  let nextY = CANVAS_PADDING;
  for (let row = 0; row < Math.ceil(domains.length / GROUP_COLUMNS); row += 1) {
    rowOffsets[row] = nextY;
    const rowHeight = Math.max(...heights.slice(row * GROUP_COLUMNS, (row + 1) * GROUP_COLUMNS));
    nextY += rowHeight + GROUP_GAP;
  }

  const groups: KnowledgeCanvasGroup[] = [];
  const objects: KnowledgeCanvasObject[] = [];
  const nodes: ArchitectureLayoutNode[] = [];
  for (const [domainIndex, domainId] of domains.entries()) {
    const domainItems = grouped.get(domainId)!;
    const presentation = domainPresentation(domainId);
    const sceneNodeId = groupSceneId(domainId);
    const row = Math.floor(domainIndex / GROUP_COLUMNS);
    const column = domainIndex % GROUP_COLUMNS;
    const groupNode: ArchitectureLayoutNode = {
      id: sceneNodeId,
      kind: 'group',
      position: {
        x: CANVAS_PADDING + column * (GROUP_WIDTH + GROUP_GAP),
        y: rowOffsets[row]!,
      },
      width: GROUP_WIDTH,
      height: heights[domainIndex]!,
      regionId: domainId,
      regionIds: [domainId],
      draggable: false,
    };
    nodes.push(groupNode);
    groups.push({
      domainId,
      sceneNodeId,
      title: presentation.title,
      code: presentation.code,
      objectIds: domainItems.map(item => item.objectId),
    });
    for (const [itemIndex, item] of domainItems.entries()) {
      const objectNodeId = objectSceneId(item.objectId);
      nodes.push({
        id: objectNodeId,
        kind: 'content',
        position: {
          x: GROUP_PADDING + (itemIndex % CARD_COLUMNS) * (CARD_WIDTH + CARD_GAP),
          y: GROUP_HEADER_HEIGHT + GROUP_PADDING + Math.floor(itemIndex / CARD_COLUMNS) * (CARD_HEIGHT + CARD_GAP),
        },
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        parentId: sceneNodeId,
        regionId: domainId,
        nodeId: item.objectId,
        draggable: false,
      });
      objects.push({ objectId: item.objectId, sceneNodeId: objectNodeId, domainId, item });
    }
  }

  const relationInputs = items.flatMap(item => item.relations.map(relation => ({ sourceId: item.objectId, relation })))
    .sort((left, right) => relationSortKey(left.sourceId, left.relation).localeCompare(relationSortKey(right.sourceId, right.relation)));
  for (const { sourceId, relation } of relationInputs) {
    if (!itemById.has(relation.targetId)) {
      throw new Error(`KNOWLEDGE_CANVAS_RELATION_TARGET_MISSING: ${sourceId} -> ${relation.targetId}`);
    }
  }
  const groupNodes = new Map(nodes.filter(node => node.kind === 'group').map(node => [node.id, node]));
  const objectNodes = new Map(nodes.filter(node => node.kind === 'content').map(node => [node.nodeId!, node]));
  const rectangles = new Map([...objectNodes].map(([objectId, node]) => [objectId, absoluteRectangle(node, groupNodes)]));
  const obstacles = [...rectangles.values()];
  const duplicateCounts = new Map<string, number>();
  const relations: KnowledgeCanvasRelation[] = [];
  const edges: ArchitectureLayoutEdge[] = relationInputs.map(({ sourceId, relation }, index) => {
    const duplicateKey = relationSortKey(sourceId, relation);
    const ordinal = (duplicateCounts.get(duplicateKey) ?? 0) + 1;
    duplicateCounts.set(duplicateKey, ordinal);
    const sceneEdgeId = `knowledge-relation:${sourceId}:${relation.relationType}:${relation.targetId}:${ordinal}`;
    const source = rectangles.get(sourceId)!;
    const target = rectangles.get(relation.targetId)!;
    const presentationKind = RELATION_KIND[relation.relationType];
    const route = routeOrthogonalEdge({
      id: sceneEdgeId,
      source,
      target,
      obstacles: obstacles.filter(obstacle => obstacle.id !== source.id && obstacle.id !== target.id),
      relation: presentationKind,
      channelIndex: index % 9,
    });
    relations.push({
      sceneEdgeId,
      sourceId,
      targetId: relation.targetId,
      relationType: relation.relationType,
      ...(relation.rationale ? { rationale: relation.rationale } : {}),
      presentationKind,
    });
    return {
      id: sceneEdgeId,
      source: objectSceneId(sourceId),
      target: objectSceneId(relation.targetId),
      kind: presentationKind,
      sourceHandle: route.sourceHandle,
      targetHandle: route.targetHandle,
      marker: route.marker,
      waypoints: route.waypoints,
      label: relation.relationType,
      animated: false,
    };
  });

  const bounds = {
    x: 0,
    y: 0,
    width: CANVAS_PADDING * 2 + Math.min(GROUP_COLUMNS, domains.length) * GROUP_WIDTH + Math.max(0, Math.min(GROUP_COLUMNS, domains.length) - 1) * GROUP_GAP,
    height: Math.max(nextY - GROUP_GAP + CANVAS_PADDING, 400),
  };
  return {
    schemaVersion: 'doccanvas-knowledge-canvas-projection-v1',
    groups,
    objects,
    relations,
    layout: { view: 'focused-region', regionId: 'knowledge-canvas', nodes, edges, bounds },
  };
}
