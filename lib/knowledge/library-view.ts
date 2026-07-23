import type {
  KnowledgeLibraryItem,
  KnowledgeLibrarySort,
} from './library-types';

export interface KnowledgeVirtualWindowInput {
  itemCount: number;
  columnCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscanRows?: number;
}

export interface KnowledgeVirtualWindow {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  totalHeight: number;
}

function validTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortKnowledgeItems(
  items: readonly KnowledgeLibraryItem[],
  sort: KnowledgeLibrarySort,
): KnowledgeLibraryItem[] {
  const sorted = [...items];
  if (sort === 'relevance') return sorted;
  return sorted.sort((left, right) => {
    if (sort === 'title') {
      return left.title.localeCompare(right.title, 'zh-CN') || left.objectId.localeCompare(right.objectId);
    }
    if (sort === 'observed') {
      return validTimestamp(right.observedAt) - validTimestamp(left.observedAt)
        || left.objectId.localeCompare(right.objectId);
    }
    return right.revision - left.revision || left.objectId.localeCompare(right.objectId);
  });
}

export function calculateKnowledgeVirtualWindow({
  itemCount,
  columnCount,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscanRows = 3,
}: KnowledgeVirtualWindowInput): KnowledgeVirtualWindow {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  const safeColumns = Math.max(1, Math.floor(columnCount));
  const safeRowHeight = Math.max(1, rowHeight);
  const rowCount = Math.ceil(safeItemCount / safeColumns);
  const firstVisibleRow = Math.min(
    Math.max(0, rowCount - 1),
    Math.max(0, Math.floor(Math.max(0, scrollTop) / safeRowHeight)),
  );
  const visibleRows = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / safeRowHeight));
  const startRow = Math.max(0, firstVisibleRow - Math.max(0, overscanRows));
  const endRow = Math.min(rowCount, firstVisibleRow + visibleRows + Math.max(0, overscanRows));
  return {
    startIndex: Math.min(safeItemCount, startRow * safeColumns),
    endIndex: Math.min(safeItemCount, endRow * safeColumns),
    offsetTop: startRow * safeRowHeight,
    totalHeight: rowCount * safeRowHeight,
  };
}
