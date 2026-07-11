/**
 * lib/parser/types.ts — Type definitions for the DocCanvas graph model
 */
export interface DocCanvas {
  id: string;
  title: string;
  version: string;
  documentPath: string;
  nodes: DocNode[];
  edges: DocEdge[];
  metadata: {
    totalSections: number;
    depth: number;
    lastParsed: string;
  };
}

export interface DocNode {
  id: string;
  type: 'document' | 'section' | 'subsection' | 'track' | 'step' | 'tool' | 'prompt' | 'principle';
  title: string;
  content: string; // full markdown content of this section
  summary: string; // first paragraph as summary
  level: number;   // heading depth: H1=1, H2=2, etc.
  position: { x: number; y: number };
  track?: 'vibe' | 'pro' | 'both'; // Vibe Track or Pro Track labeling
  stageNumber?: number; // 0-8 for the 8 stages
  toolReferences?: string[]; // KB: agent_frameworks.mastra etc.
  promptTemplates?: string[]; // Codex prompt blocks
  // Distinct content blocks extracted from this section, in document order.
  // `code` blocks carry a `language` marker; ```bash/```sh represent commands and
  // ```yaml/```json represent config (distinguished via `language`), while ```text
  // Codex prompts are surfaced as `prompt` blocks.
  contentBlocks: Array<{ type: 'paragraph' | 'code' | 'table' | 'list' | 'prompt'; content: string; language?: string }>;
  metadata: Record<string, unknown>;
  children: string[]; // child node IDs
}

export interface DocEdge {
  id: string;
  source: string;
  target: string;
  type: 'flow' | 'track' | 'reference' | 'expansion';
  label?: string;
  animated?: boolean;
}

export interface CanvasState {
  documentId: string;
  viewport: { x: number; y: number; zoom: number };
  expandedNodes: string[];
  nodePositions: Record<string, { x: number; y: number }>;
  lastSaved: string;
}
