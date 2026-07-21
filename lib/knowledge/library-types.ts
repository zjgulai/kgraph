export type KnowledgeRelationType =
  | 'supports'
  | 'contradicts'
  | 'supersedes'
  | 'requires'
  | 'alternative_to'
  | 'derived_from'
  | 'tested_by'
  | 'used_in'
  | 'blocks'
  | 'optimizes_for'
  | 'observed_in'
  | 'context_depends_on';

export interface KnowledgeRelationRef {
  relationType: KnowledgeRelationType;
  targetId: string;
  rationale?: string;
}

export interface KnowledgeLibraryItem {
  origin?: 'legacy_seed' | 'capture';
  generationMode?: 'extractive' | 'provider_structured';
  objectId: string;
  objectHash: string;
  title: string;
  summary: string;
  objectType: string;
  knowledgeForm: string;
  domainRefs: string[];
  assetMaturity: string;
  scope: string;
  validTime: { from: string | null; until: string | null };
  observedAt: string;
  evidenceGrade: string;
  promotionState: string;
  revision: number;
  source: {
    uri: string;
    locator: string;
    authorityOrigin: string;
    observedAt: string;
  };
  legacy: {
    category: string;
    status: string;
    recommendationRank: string;
    recommendationContext: string;
    version: string | null;
    stars: number | null;
    pricingModel: string | null;
  };
  reviewReasons: string[];
  warningCodes: string[];
  relations: KnowledgeRelationRef[];
}

export interface KnowledgeLibraryProjection {
  schemaVersion: 'doccanvas-knowledge-library-projection-v1';
  source: {
    ref: string;
    packHash: string;
    sourceHash: string;
    generatedAt: string;
  };
  stats: {
    total: number;
    reviewRequired: number;
    warningCount: number;
    domainCount: number;
    lifecycleReview: number;
  };
  items: KnowledgeLibraryItem[];
}

export interface KnowledgeLibraryFilters {
  query: string;
  domain: string;
  knowledgeForm: string;
  evidenceGrade: string;
  assetMaturity: string;
  lifecycle: string;
}

export const EMPTY_KNOWLEDGE_FILTERS: KnowledgeLibraryFilters = {
  query: '',
  domain: '',
  knowledgeForm: '',
  evidenceGrade: '',
  assetMaturity: '',
  lifecycle: '',
};
