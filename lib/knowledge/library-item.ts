import type { KnowledgeObject } from '../../../scripts/lib/knowledge-object-contract';
import { splitKnowledgeBody } from './legacy-snapshot';
import type { KnowledgeLibraryItem } from './library-types';

type LibraryGovernanceBase = Pick<KnowledgeLibraryItem, 'legacy' | 'reviewReasons' | 'warningCodes'>
  & Pick<KnowledgeLibraryItem, 'origin' | 'generationMode'>;

export function projectKnowledgeObjectToLibraryItem(
  object: KnowledgeObject,
  objectHash: string,
  base: LibraryGovernanceBase,
): KnowledgeLibraryItem {
  const primarySource = object.source_refs[0];
  if (!primarySource) throw new Error(`KNOWLEDGE_LIBRARY_SOURCE_MISSING: ${object.object_id}`);
  return {
    ...(base.origin ? { origin: base.origin } : {}),
    ...(base.generationMode ? { generationMode: base.generationMode } : {}),
    objectId: object.object_id,
    objectHash,
    title: object.title,
    summary: splitKnowledgeBody(object.body).narrative.trim(),
    objectType: object.object_type,
    knowledgeForm: object.knowledge_form.primary,
    domainRefs: [...object.domain_refs],
    assetMaturity: object.asset_maturity,
    scope: object.scope,
    validTime: object.valid_time ? { ...object.valid_time } : { from: null, until: null },
    observedAt: object.observed_at,
    evidenceGrade: object.evidence_grade,
    promotionState: object.promotion_state,
    revision: object.revision,
    source: {
      uri: primarySource.source_uri,
      locator: primarySource.locator ?? '',
      authorityOrigin: primarySource.authority_origin,
      observedAt: primarySource.observed_at,
    },
    legacy: { ...base.legacy },
    reviewReasons: [...base.reviewReasons],
    warningCodes: [...base.warningCodes],
    relations: (object.relations ?? []).map(relation => ({
      relationType: relation.relation_type,
      targetId: relation.target_id,
      ...(relation.rationale ? { rationale: relation.rationale } : {}),
    })),
  };
}
