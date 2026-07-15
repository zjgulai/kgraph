import { z } from 'zod';
import type { FactoryEmployeeStatus, FactoryEnvironmentId } from './factory-presentation';
import type { ArchitectureViewModel } from './architecture-view-model';
import type { DocCanvas, DocNode } from '@/lib/parser/types';

export interface ModulePresentationProfile {
  title?: string;
  summary?: string;
  order?: number;
  employee?: {
    displayName: string;
    roleTitle: string;
    status: FactoryEmployeeStatus;
    portraitAssetId?: string;
  };
  environmentId?: FactoryEnvironmentId;
}

export interface DocumentPresentationSidecar {
  schemaVersion: 1;
  documentId: string;
  revision: number;
  documentHash: string;
  updatedAt: string;
  modules: Record<string, ModulePresentationProfile>;
  nodeTypes: Record<string, Exclude<DocNode['type'], 'document' | 'track'>>;
  deletedSectionHashes: string[];
}

const EmployeeSchema = z.object({
  displayName: z.string().min(1).max(80),
  roleTitle: z.string().min(1).max(120),
  status: z.enum(['online', 'processing', 'needs-validation', 'restricted']),
  portraitAssetId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

const ModuleProfileSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  summary: z.string().max(500).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  employee: EmployeeSchema.optional(),
  environmentId: z.enum([
    'navigation-archive',
    'operations-floor',
    'knowledge-studio',
    'security-control',
    'evolution-lab',
    'delivery-bay',
    'business-observatory',
    'boundary-review-room',
    'factory-entrance',
    'shared-foundation',
    'resource-annex',
    'unassigned-room',
  ]).optional(),
}).strict();

const NodeTypeSchema = z.enum(['section', 'subsection', 'step', 'tool', 'prompt', 'principle']);

export const DocumentPresentationSidecarSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  revision: z.number().int().min(0),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string(),
  modules: z.record(ModuleProfileSchema).default({}),
  nodeTypes: z.record(NodeTypeSchema).default({}),
  deletedSectionHashes: z.array(z.string().regex(/^[a-f0-9]{12}$/)).max(5_000).default([]),
}).strict();

export function createPresentationSidecar(
  documentId: string,
  documentHash: string,
): DocumentPresentationSidecar {
  return {
    schemaVersion: 1,
    documentId,
    revision: 0,
    documentHash,
    updatedAt: new Date(0).toISOString(),
    modules: {},
    nodeTypes: {},
    deletedSectionHashes: [],
  };
}

export function parsePresentationSidecar(value: unknown): DocumentPresentationSidecar {
  return DocumentPresentationSidecarSchema.parse(value);
}

function sectionHashOf(node: DocNode): string | undefined {
  const value = node.metadata.sectionHash;
  return typeof value === 'string' ? value : undefined;
}

export function applyDocumentSidecar(
  document: DocCanvas,
  sidecar: DocumentPresentationSidecar | null | undefined,
): DocCanvas {
  if (!sidecar) return document;
  const deleted = new Set(sidecar.deletedSectionHashes);
  const nodes = document.nodes.filter(node => {
    const hash = sectionHashOf(node);
    return !hash || !deleted.has(hash);
  }).map(node => {
    const hash = sectionHashOf(node);
    const type = hash ? sidecar.nodeTypes[hash] : undefined;
    return type ? { ...node, type } : node;
  });
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    ...document,
    nodes: nodes.map(node => ({
      ...node,
      children: node.children.filter(childId => nodeIds.has(childId)),
    })),
    edges: document.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

export function applyArchitectureSidecar(
  model: ArchitectureViewModel,
  sidecar: DocumentPresentationSidecar | null | undefined,
): ArchitectureViewModel {
  if (!sidecar || model.mode !== 'module') return model;
  const regions = model.regions.map(region => {
    const profile = sidecar.modules[region.id];
    return profile ? {
      ...region,
      title: profile.title ?? region.title,
      summary: profile.summary ?? region.summary,
      order: profile.order ?? region.order,
    } : region;
  });
  const roomRegions = regions
    .filter(region => region.kind === 'room')
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const floors = model.floors.map((floor, index) => ({
    ...floor,
    regionIds: roomRegions.slice(index * 4, index * 4 + floor.regionIds.length).map(region => region.id),
  }));
  return { ...model, regions, floors };
}
