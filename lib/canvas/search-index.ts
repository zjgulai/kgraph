import type { DocNode } from '../parser/types';
import type { NodePresentation } from './document-presentation';

export interface SearchPresentationEntry {
  nodeId: string;
  regionId?: string;
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
  accessibleLabel: string;
}

export type SearchPresentationResult = SearchPresentationEntry;

export interface DocumentSearchIndex {
  entries: readonly SearchPresentationEntry[];
  search(query: string, limit?: number): readonly SearchPresentationResult[];
}

interface SearchRecord {
  order: number;
  payload: SearchPresentationEntry;
  displayTitle: string;
  displaySummary: string;
  sourceLabel: string;
  rawTitle: string;
  rawSummary: string;
  rawContent: string;
}

const EMPTY_RESULTS: readonly SearchPresentationResult[] = Object.freeze([]);

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

function fieldScore(value: string, query: string, scores: readonly [number, number, number]): number {
  if (!value) return 0;
  if (value === query) return scores[0];
  if (value.startsWith(query)) return scores[1];
  return value.includes(query) ? scores[2] : 0;
}

function matchScore(record: SearchRecord, query: string): number {
  return Math.max(
    fieldScore(record.displayTitle, query, [1_000, 950, 900]),
    fieldScore(record.sourceLabel, query, [875, 850, 825]),
    fieldScore(record.rawTitle, query, [800, 775, 750]),
    fieldScore(record.displaySummary, query, [700, 675, 650]),
    fieldScore(record.rawSummary, query, [600, 575, 550]),
    fieldScore(record.rawContent, query, [300, 275, 250]),
  );
}

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 12;
  return Math.max(0, Math.floor(limit));
}

export function createDocumentSearchIndex(
  nodes: readonly DocNode[],
  presentationByNodeId: ReadonlyMap<string, NodePresentation>,
  nodeRegionId: Readonly<Record<string, string>> = {},
): DocumentSearchIndex {
  const records: SearchRecord[] = [];

  for (const [order, node] of nodes.entries()) {
    const presentation = presentationByNodeId.get(node.id);
    if (!presentation) continue;
    const regionId = nodeRegionId[node.id];
    const payload = Object.freeze({
      nodeId: node.id,
      ...(regionId ? { regionId } : {}),
      displayTitle: presentation.displayTitle,
      displaySummary: presentation.displaySummary,
      sourceLabel: presentation.sourceLabel,
      accessibleLabel: presentation.accessibleLabel,
    }) satisfies SearchPresentationEntry;

    records.push({
      order,
      payload,
      displayTitle: normalizeSearchText(presentation.displayTitle),
      displaySummary: normalizeSearchText(presentation.displaySummary),
      sourceLabel: normalizeSearchText(presentation.sourceLabel),
      rawTitle: normalizeSearchText(node.title),
      rawSummary: normalizeSearchText(node.summary),
      rawContent: normalizeSearchText(node.content),
    });
  }

  const entries = Object.freeze(records.map(record => record.payload));

  const search = (query: string, limit?: number): readonly SearchPresentationResult[] => {
    const normalizedQuery = normalizeSearchText(query);
    const resultLimit = boundedLimit(limit);
    if (!normalizedQuery || resultLimit === 0) return EMPTY_RESULTS;

    return Object.freeze(
      records
        .map(record => ({ record, score: matchScore(record, normalizedQuery) }))
        .filter(match => match.score > 0)
        .sort((left, right) => right.score - left.score || left.record.order - right.record.order)
        .slice(0, resultLimit)
        .map(match => match.record.payload),
    );
  };

  return Object.freeze({ entries, search });
}
