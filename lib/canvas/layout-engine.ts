/**
 * lib/canvas/layout-engine.ts — Auto-layout algorithm for Playbook document graphs
 *
 * Layout Strategy:
 *   Main trunk: Vertical — Stage 0→1→2→3→4→5→6→7→8, center column
 *   Branches: Horizontal — Vibe Track (left) / Pro Track (right) branch from each stage
 *   Tools: Docked below their parent section, smaller cards
 *   Prompts: Expandable cards docked at far right
 *
 * Parameters tuned for 1920×1080 viewport with React Flow snap-to-grid.
 */
import type { DocNode, DocEdge } from '../parser/types';

const CANVAS_WIDTH = 4800;
const STAGE_SPACING_Y = 320;
const BRANCH_OFFSET_X = 380;
const CARD_WIDTH = 280;
const CARD_HEIGHT = 120;
const TRACK_NODE_HEIGHT = 80;

export interface LayoutResult {
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
}

export function computeLayout(
  docNodes: DocNode[],
  docEdges: DocEdge[],
  canvasState?: Record<string, { x: number; y: number }>
): LayoutResult {
  const positions: Array<{ id: string; position: { x: number; y: number } }> = [];

  // If user has manually positioned nodes, use those
  const manualPositions = new Map(Object.entries(canvasState || {}));
  const hasManualLayout = manualPositions.size > 5;

  // Identify stage nodes (main trunk)
  const stageNodes = docNodes.filter(n => n.stageNumber !== undefined && n.stageNumber >= 0)
    .sort((a, b) => (a.stageNumber || 0) - (b.stageNumber || 0));

  // Compute trunk positions
  const trunkCenterX = CANVAS_WIDTH / 2;
  const startY = 120;

  const stagePositions = new Map<string, { x: number; y: number }>();

  stageNodes.forEach((node, idx) => {
    const y = startY + idx * STAGE_SPACING_Y + 100;
    const pos = { x: trunkCenterX - CARD_WIDTH / 2, y };
    stagePositions.set(node.id, pos);
  });

  // Position all nodes
  const trunkIds = new Set(stageNodes.map(n => n.id));

  docNodes.forEach((node) => {
    // Use manual position if available
    if (hasManualLayout && manualPositions.has(node.id)) {
      positions.push({ id: node.id, position: manualPositions.get(node.id)! });
      return;
    }

    // Stage node — center column
    if (node.stageNumber !== undefined && node.stageNumber >= 0) {
      const pos = stagePositions.get(node.id);
      if (pos) {
        positions.push({ id: node.id, position: pos });
        return;
      }
    }

    // Find parent in edges
    const parentEdge = docEdges.find(e => e.target === node.id);
    const parentNode = parentEdge ? docNodes.find(n => n.id === parentEdge.source) : undefined;
    const parentPos = parentNode ? (stagePositions.get(parentNode.id) || positions.find(p => p.id === parentNode.id)?.position) : undefined;

    // Track nodes — branch left (vibe) or right (pro)
    if (node.type === 'track' || node.track) {
      const isVibe = node.track === 'vibe';
      const baseY = parentPos ? parentPos.y : startY;
      const baseX = parentPos ? parentPos.x : trunkCenterX;

      const offsetX = isVibe ? -BRANCH_OFFSET_X : BRANCH_OFFSET_X;
      const offsetY = node.level * 60;

      positions.push({
        id: node.id,
        position: { x: baseX + offsetX, y: baseY + offsetY + 40 },
      });
      return;
    }

    // Tool/prompt nodes — position below their parent section
    if (node.type === 'tool' || node.type === 'prompt') {
      const section = findSectionParent(node, docNodes, docEdges);
      if (section) {
        const sectionPos = stagePositions.get(section.id) || positions.find(p => p.id === section.id)?.position;
        if (sectionPos) {
          const childCount = docEdges.filter(e => e.source === section.id).length;
          const childIdx = docEdges.filter(e => e.source === section.id).findIndex(e => e.target === node.id);
          positions.push({
            id: node.id,
            position: {
              x: sectionPos.x + CARD_WIDTH + 20 + (childIdx % 3) * 200,
              y: sectionPos.y + 20 + Math.floor(childIdx / 3) * 100,
            },
          });
          return;
        }
      }
    }

    // Subsection — indent from parent
    if (parentPos) {
      const childCount = docEdges.filter(e => e.source === parentNode?.id).length;
      const childIdx = docEdges.filter(e => e.source === parentNode?.id).findIndex(e => e.target === node.id);
      const indentX = 180;
      const indentY = (childIdx + 1) * 100;

      positions.push({
        id: node.id,
        position: { x: parentPos.x + indentX, y: parentPos.y + indentY },
      });
      return;
    }

    // Document-level: place in preamble area
    // Use deterministic hash-based positioning (not Math.random) so layout is reproducible
    let hash = 0;
    for (let i = 0; i < node.id.length; i++) hash = ((hash << 5) - hash + node.id.charCodeAt(i)) | 0;
    const deterministicY = 50 + (Math.abs(hash) % 7) * 45;
    positions.push({
      id: node.id,
      position: { x: trunkCenterX - 200 + (Math.abs(hash) % 5) * 40, y: deterministicY },
    });
  });

  return { nodes: positions };
}

function findSectionParent(
  node: DocNode, allNodes: DocNode[], edges: DocEdge[],
  visited = new Set<string>(), depth = 0
): DocNode | undefined {
  if (visited.has(node.id) || depth > 20) return undefined; // cycle guard + depth limit
  visited.add(node.id);
  const edge = edges.find(e => e.target === node.id);
  if (!edge) return undefined;
  const parent = allNodes.find(n => n.id === edge.source);
  if (!parent) return undefined;
  if (parent.stageNumber !== undefined && parent.stageNumber >= 0) return parent;
  return findSectionParent(parent, allNodes, edges, visited, depth + 1);
}
