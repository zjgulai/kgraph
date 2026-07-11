import type { DocNode } from '@/lib/parser/types';

interface SavedNodePatch {
  id: string;
  title: string;
  content: string;
  hash?: string;
}

function summarize(content: string) {
  return (content.split('\n').find(line => line.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function updateDocNodeAfterSave(nodes: DocNode[], patch: SavedNodePatch): DocNode[] {
  return nodes.map(node => {
    if (node.id !== patch.id) return node;
    return {
      ...node,
      title: patch.title,
      content: patch.content,
      summary: summarize(patch.content),
      metadata: {
        ...node.metadata,
        sectionHash: patch.hash ?? node.metadata.sectionHash,
      },
    };
  });
}

export function removeDocNodeFromView(nodes: DocNode[], nodeId: string): DocNode[] {
  return nodes.filter(node => node.id !== nodeId);
}

export function isDocNodeHiddenByTrack(node: DocNode, expandedTracks: Set<string>): boolean {
  if (node.track !== 'vibe' && node.track !== 'pro') return false;
  if (node.stageNumber === undefined || node.stageNumber < 0) return false;
  return !expandedTracks.has(`stage${node.stageNumber}-${node.track}`);
}
