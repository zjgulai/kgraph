import type { KnowledgeLibraryFilters, KnowledgeLibraryItem } from './library-types';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}
export function filterKnowledgeItems(
  items: KnowledgeLibraryItem[],
  filters: KnowledgeLibraryFilters,
): KnowledgeLibraryItem[] {
  const query = normalized(filters.query);
  return items.filter(item => {
    if (filters.domain && !item.domainRefs.includes(filters.domain)) return false;
    if (filters.knowledgeForm && item.knowledgeForm !== filters.knowledgeForm) return false;
    if (filters.evidenceGrade && item.evidenceGrade !== filters.evidenceGrade) return false;
    if (filters.assetMaturity && item.assetMaturity !== filters.assetMaturity) return false;
    if (filters.lifecycle && item.legacy.status !== filters.lifecycle) return false;
    if (!query) return true;
    const searchText = normalized([
      item.title,
      item.objectId,
      item.summary,
      item.objectType,
      item.knowledgeForm,
      item.domainRefs.join(' '),
      item.legacy.category,
      item.legacy.recommendationContext,
    ].join(' '));
    return searchText.includes(query);
  });
}
