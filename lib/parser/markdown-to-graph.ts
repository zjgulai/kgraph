/**
 * lib/parser/markdown-to-graph.ts — Convert Playbook Markdown documents to a ReactFlow graph
 *
 * Parses Playbook-style Markdown (VibeTrack roadmap, Playbook-v2 genome doc) into a
 * DocCanvas graph (nodes + edges) ready for React Flow rendering.
 *
 * Enhancements over the original heading-only parser:
 *
 *   1. Track-aware parsing — detects the repeating in-stage pattern
 *        ### 🚀 Vibe Track  →  ### 🛠️ Pro Track  →  ### 🔗 衔接 → 阶段X
 *      and builds Vibe/Pro sub-graphs under each stage. Codex prompts are pulled from
 *      Vibe sections; tool references are pulled from Pro sections.
 *
 *   2. Content-block extraction — every section is broken into distinct blocks
 *      (paragraph / code / table / list / prompt). Fenced code is classified by its
 *      language marker: ```text → prompt, ```bash|sh → command-style code,
 *      ```yaml|json → config-style code (command vs config are distinguished by the
 *      `language` field since the DocNode.contentBlocks union only exposes `code`).
 *      Bold tool names (**Mastra**, **LangGraph**) become tool-reference nodes.
 *
 *   3. Stage numbering — robustly detects the 8-stage lifecycle from 阶段①…阶段⑧
 *      (circled or arabic) and the "§0 文档架构总览" overview, while keeping transition
 *      (衔接) headings, Chinese-numeral chapters (一、二…) and sub-numbered headings
 *      (3.0, 10.1, v2.0 …) off the trunk so stage nodes never collide or duplicate.
 *
 *   4. Edge type refinement:
 *        • section → subsection            = 'flow'   (solid)
 *        • Vibe / Pro Track branches        = 'track'  (colored)
 *        • tool references                  = 'reference' (dotted)
 *        • stage transitions (阶段①→阶段②)   = 'flow' with animated = true
 *
 * The public signature `parseMarkdownToGraph(markdown, documentId, filePath): DocCanvas`
 * and all exported types are unchanged.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { DocCanvas, DocNode, DocEdge } from './types';
import { extractMarkdownSections, type MarkdownSection } from '@/lib/markdown/sections';

// ---------------------------------------------------------------------------
// Minimal mdast-ish node shapes. We intentionally avoid a hard dependency on
// @types/mdast (not installed) and describe only the fields we touch.
// ---------------------------------------------------------------------------
interface MdNode {
  type: string;
  value?: string;
  lang?: string | null;
  depth?: number;
  children?: MdNode[];
  position?: {
    start?: { line?: number; offset?: number };
    end?: { line?: number; offset?: number };
  };
}
type ContentBlock = DocNode['contentBlocks'][number];

// A section == one heading plus every block that follows it up to the next heading.
interface RawSection {
  depth: number;
  title: string;
  blocks: MdNode[];
  source: MarkdownSection;
  startLine?: number;
  endLine?: number;
}

const CIRCLED: Record<string, number> = {
  '⓪': 0, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
  '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
};

// Known tools used across the Playbook docs. Bold spans matching these (or
// looking like an ASCII product/CLI name) are promoted to tool references.
const TOOL_WHITELIST = new RegExp(
  '^(' +
    [
      'LightRAG', 'LiteLLM', 'Mastra', 'LangGraph', 'Zep Graphiti', 'Mem0', 'DSPy',
      'Neo4j', 'Coolify', 'Daytona', 'Context7', 'Playwright', 'Langfuse', 'Promptfoo',
      'PostHog', 'BGE-M3', 'Qwen3-Embedding', 'Firecrawl', 'Firecrawl MCP', 'v0\\.dev',
      'SpecWright', 'claude-code-discover', 'doit', 'Inngest', 'Temporal', 'Supabase',
      'Vercel', 'shadcn/ui', 'Tailwind', 'AI Elements', 'Codex', 'Codex CLI', 'Codex Desktop',
      'Infisical', 'Dembrandt', 'Appshot', 'Qdrant', 'Pinecone', 'pgvector', 'Modal',
      'Railway', 'OpenAI', 'Anthropic', 'Claude Code', 'Perplexity', 'GitHub',
    ].join('|') +
    ')$',
  'i',
);

// ---------------------------------------------------------------------------
// Inline text helpers
// ---------------------------------------------------------------------------

/** Recursively flatten an inline (phrasing) node into its plain text. */
function inlineText(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  if (node.children && node.children.length) return node.children.map(inlineText).join('');
  return typeof node.value === 'string' ? node.value : '';
}

/** Collect the text of every **bold** span found anywhere under `node`. */
function collectStrong(node: MdNode, out: string[]): void {
  if (node.type === 'strong') out.push(inlineText(node).trim());
  if (node.children) for (const c of node.children) collectStrong(c, out);
}

/** Serialize a GFM list into `- item` lines. */
function listToText(list: MdNode): string {
  return (list.children ?? [])
    .map((li) => '- ' + (li.children ?? []).map(inlineText).join(' ').replace(/\s+/g, ' ').trim())
    .join('\n');
}

/** Serialize a GFM table into `cell | cell` rows. */
function tableToText(table: MdNode): string {
  return (table.children ?? [])
    .map((row) => (row.children ?? []).map((cell) => inlineText(cell).trim()).join(' | '))
    .join('\n');
}

// ---------------------------------------------------------------------------
// Content-block extraction (Enhancement 2)
// ---------------------------------------------------------------------------

function buildContentBlocks(blocks: MdNode[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'paragraph':
      case 'blockquote': {
        const text = inlineText(b).replace(/\s+\n/g, '\n').trim();
        if (text) out.push({ type: 'paragraph', content: text });
        break;
      }
      case 'code': {
        const lang = (b.lang ?? '').toLowerCase();
        const value = (b.value ?? '').trim();
        if (!value) break;
        // ```text (and code that visibly contains a Codex prompt) → prompt block.
        const looksLikePrompt = lang === 'text' || /codex|提示词|prompt/i.test(value.slice(0, 80));
        if (looksLikePrompt) {
          out.push({ type: 'prompt', content: value, language: lang || 'text' });
        } else {
          // ```bash/```sh (commands) and ```yaml/```json (config) both land here;
          // the `language` marker preserves the command-vs-config distinction.
          out.push({ type: 'code', content: value, language: lang || undefined });
        }
        break;
      }
      case 'list': {
        const text = listToText(b);
        if (text) out.push({ type: 'list', content: text });
        break;
      }
      case 'table': {
        const text = tableToText(b);
        if (text) out.push({ type: 'table', content: text });
        break;
      }
      default:
        // thematicBreak / html / definition etc. — ignored.
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

/** Which track a heading belongs to. Only 'vibe'/'pro' become track nodes. */
function detectTrack(title: string): DocNode['track'] {
  if (/🚀|Vibe\s*Track/i.test(title)) return 'vibe';
  if (/🛠️|🛠|Pro\s*Track/i.test(title)) return 'pro';
  if (/上车前|元原则|核心模式|衔接|铁律|工具速查|工具清单/.test(title)) return 'both';
  return undefined;
}

/** Map a heading to a DocNode type. */
function classifyNode(depth: number, title: string, track: DocNode['track']): DocNode['type'] {
  if (depth === 1) return 'document';
  if (track === 'vibe' || track === 'pro') return 'track';
  if (/🔗|衔接/.test(title)) return 'step';
  if (/元原则|核心模式|铁律/.test(title)) return 'principle';
  if (/TOP\s*\d|工具速查|工具清单|工具速览/.test(title)) return 'tool';
  if (depth === 2) return 'section';
  return 'subsection';
}

/**
 * Detect a lifecycle stage number (Enhancement 3).
 *   阶段①…阶段⑧  /  阶段0…阶段8            → circled or arabic value
 *   §0 文档架构总览  /  "0. 文档架构总览"      → 0
 *
 * Returns undefined for everything else — including transition (衔接) headings that
 * merely *point* at the next stage ("🔗 衔接 → 阶段②"), the Chinese-numeral chapters
 * of Playbook-v2 (一、二…), sub-numbered headings (3.0, 10.1) and changelog rows
 * (v2.0 …). Keeping these off the trunk avoids duplicate / colliding stage nodes.
 */
function stageNumber(title: string): number | undefined {
  // Transition headings carry a "→ 阶段X" arrow but are not a stage themselves.
  if (/🔗|衔接/.test(title)) return undefined;

  const stageMatch = title.match(/阶段\s*([⓪①②③④⑤⑥⑦⑧⑨⑩]|\d+)/);
  if (stageMatch) {
    const t = stageMatch[1];
    return CIRCLED[t] ?? parseInt(t, 10);
  }

  // Document-architecture overview is stage 0. Match the unambiguous title, or a
  // leading "0."/"§0" prefix anchored at the start (so "3.0"/"10.1" never match).
  if (/文档架构总览/.test(title)) return 0;
  if (/^\s*(?:§\s*)?0\s*[.、．](?:\s+|$)/.test(title)) return 0;

  return undefined;
}

// ---------------------------------------------------------------------------
// Prompt / tool extraction (Enhancements 1c / 1d / 2)
// ---------------------------------------------------------------------------

/** Codex prompt templates come from `prompt` blocks (largest / most relevant first). */
function extractPrompts(blocks: ContentBlock[]): string[] {
  return blocks
    .filter((b) => b.type === 'prompt')
    .map((b) => b.content.trim())
    .filter((p) => p.length > 20)
    .map((p) => (p.length > 800 ? p.slice(0, 800) + '…' : p))
    .slice(0, 10);
}

/**
 * Tool references: [KB: …] pointers, github links, and bold tool names.
 * `strongs` is the list of every bold span already collected from the section.
 */
function extractTools(rawText: string, strongs: string[]): string[] {
  const tools = new Set<string>();

  for (const m of rawText.match(/\[KB:\s*[^\]]+\]/g) ?? []) tools.add(m.trim());
  for (const m of rawText.match(/github\.com\/[^\s)|]+/g) ?? []) tools.add(m.trim());

  for (const raw of strongs) {
    const clean = raw.replace(/[（(].*$/, '').trim(); // drop trailing "(6.6K⭐)" etc.
    if (!clean) continue;
    const isWhitelisted = TOOL_WHITELIST.test(clean);
    // Otherwise accept short ASCII product/CLI-looking names (≤3 words, starts alpha).
    const looksLikeTool =
      /^[A-Za-z][A-Za-z0-9._/+\- ]{1,28}$/.test(clean) && clean.split(/\s+/).length <= 3;
    if (isWhitelisted || looksLikeTool) tools.add(clean);
  }

  return [...tools].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Main entry point

export function parseMarkdownToGraph(markdown: string, documentId: string, filePath: string): DocCanvas {
  const sourceSections = extractMarkdownSections(markdown);
  const sectionsByStartOffset = new Map(sourceSections.map(section => [section.startOffset, section]));
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as unknown as MdNode;
  const roots = tree.children ?? [];

  // --- Pass 1: slice the document into heading-delimited sections ----------
  const rawSections: RawSection[] = [];
  let current: RawSection | null = null;
  for (const child of roots) {
    if (child.type === 'heading') {
      const source = sectionsByStartOffset.get(child.position?.start?.offset ?? -1);
      if (!source) {
        current = null;
        continue;
      }
      if (current) current.endLine = (child.position?.start?.line ?? 1) - 1;
      current = {
        depth: source.depth,
        title: source.heading,
        blocks: [],
        source,
        startLine: child.position?.start?.line,
      };
      rawSections.push(current);
    } else if (current) {
      current.blocks.push(child);
    }
    // Content before the first heading is preamble and intentionally dropped.
  }
  if (current) current.endLine = roots[roots.length - 1]?.position?.end?.line;

  const nodes: DocNode[] = [];
  const edges: DocEdge[] = [];
  const nodeById = new Map<string, DocNode>();
  let seq = 0;

  let docTitle = '';
  let docVersion = '';
  let currentStage: number | undefined;
  let currentStageDepth: number | undefined;
  let currentTrack: DocNode['track'];
  let currentTrackDepth: number | undefined;

  // --- Pass 2: build a DocNode per section ---------------------------------
  for (const sec of rawSections) {
    const contentBlocks = buildContentBlocks(sec.blocks);
    const declaredTrack = detectTrack(sec.title);
    const declaredStage = stageNumber(sec.title);

    if (currentTrackDepth !== undefined && sec.depth <= currentTrackDepth) {
      currentTrack = undefined;
      currentTrackDepth = undefined;
    }
    if (currentStageDepth !== undefined && sec.depth <= currentStageDepth) {
      currentStage = undefined;
      currentStageDepth = undefined;
      currentTrack = undefined;
      currentTrackDepth = undefined;
    }
    if (declaredStage !== undefined) {
      currentStage = declaredStage;
      currentStageDepth = sec.depth;
      currentTrack = undefined;
      currentTrackDepth = undefined;
    }
    if (declaredTrack !== undefined) {
      currentTrack = declaredTrack;
      currentTrackDepth = sec.depth;
    }

    const track = declaredTrack ?? currentTrack;
    const stage = declaredStage ?? currentStage;
    const type = classifyNode(sec.depth, sec.title, declaredTrack);

    // Raw text + bold spans (used for tool extraction).
    const strongs: string[] = [];
    for (const b of sec.blocks) collectStrong(b, strongs);
    const rawText = contentBlocks.map((b) => b.content).join('\n');

    const promptTemplates = extractPrompts(contentBlocks);
    const toolReferences = extractTools(rawText, strongs);

    const content = sec.source.body;
    const firstParagraph = contentBlocks.find((b) => b.type === 'paragraph');
    const summary = (firstParagraph?.content ?? rawText).replace(/\s+/g, ' ').trim().slice(0, 200);

    if (sec.depth === 1 && !docTitle) {
      docTitle = sec.title;
      const vMatch = rawText.match(/v?\d+\.\d+(?:\.\d+)?/i);
      if (vMatch) docVersion = vMatch[0];
    }

    const nodeId = `node-${documentId}-${seq++}`;
    const docNode: DocNode = {
      id: nodeId,
      type,
      title: sec.title,
      content,
      summary,
      level: sec.depth,
      position: { x: 0, y: 0 },
      track,
      stageNumber: stage,
      toolReferences,
      promptTemplates,
      contentBlocks,
      metadata: {
        blockCount: contentBlocks.length,
        promptCount: promptTemplates.length,
        toolCount: toolReferences.length,
        sectionHash: sec.source.hash,
        startLine: sec.startLine,
        endLine: sec.endLine,
        headingDepth: sec.depth,
        isStageHeading: declaredStage !== undefined,
      },
      children: [],
    };
    nodes.push(docNode);
    nodeById.set(nodeId, docNode);
  }

  // --- Pass 3: hierarchy edges (parent → child) ----------------------------
  // Uses a heading-depth stack. Edges from the document root to top-level stage
  // nodes are skipped: the stage trunk is wired separately in Pass 4.
  const stack: DocNode[] = [];
  for (const node of nodes) {
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1] : undefined;

    if (parent) {
      const isStageChild = parent.type === 'document' && node.metadata.isStageHeading === true;
      if (!isStageChild) {
        edges.push(makeHierarchyEdge(parent, node));
        parent.children.push(node.id);
      }
    }
    stack.push(node);
  }

  // --- Pass 4: stage-transition trunk (阶段①→阶段②, animated flow) ----------
  const stageNodes = nodes
    .filter((n) => n.metadata.isStageHeading === true)
    .sort((a, b) => (a.stageNumber! - b.stageNumber!));
  const docNode = nodes.find((n) => n.type === 'document');
  for (let i = 0; i < stageNodes.length; i++) {
    const prev = i === 0 ? docNode : stageNodes[i - 1];
    if (!prev) continue;
    edges.push({
      id: `edge-stage-${prev.id}-${stageNodes[i].id}`,
      source: prev.id,
      target: stageNodes[i].id,
      type: 'flow',
      animated: true,
    });
    if (i > 0) prev.children.push(stageNodes[i].id);
  }

  // --- Pass 5: tool-reference nodes + dotted 'reference' edges --------------
  // Bold tool names / KB pointers within a section spawn small tool nodes so the
  // canvas can show which tools each stage leans on. Scoped per section (deduped,
  // capped) to keep the auto-layout stable.
  const TOOL_NODE_HOSTS = new Set<DocNode['type']>(['section', 'subsection', 'track', 'principle', 'tool']);
  const headingCount = nodes.length;
  for (let i = 0; i < headingCount; i++) {
    const host = nodes[i];
    if (!TOOL_NODE_HOSTS.has(host.type)) continue;
    if (!host.toolReferences || host.toolReferences.length === 0) continue;

    const seen = new Set<string>();
    for (const ref of host.toolReferences) {
      const name = ref.replace(/^\[KB:\s*/, '').replace(/\]$/, '').trim();
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 4) break; // cap references per section

      const toolId = `node-${documentId}-${seq++}`;
      const toolNode: DocNode = {
        id: toolId,
        type: 'tool',
        title: name,
        content: name,
        summary: name.slice(0, 200),
        level: host.level + 1,
        position: { x: 0, y: 0 },
        track: host.track,
        stageNumber: host.stageNumber,
        toolReferences: [],
        promptTemplates: [],
        contentBlocks: [{ type: 'paragraph', content: name }],
        metadata: { isToolReference: true, referencedBy: host.id },
        children: [],
      };
      nodes.push(toolNode);
      nodeById.set(toolId, toolNode);
      host.children.push(toolId);
      edges.push({
        id: `edge-ref-${host.id}-${toolId}`,
        source: host.id,
        target: toolId,
        type: 'reference', // dotted
        animated: false,
      });
    }
  }

  return {
    id: documentId,
    title: docTitle || documentId,
    version: docVersion || 'v1',
    documentPath: filePath,
    nodes,
    edges,
    metadata: {
      totalSections: nodes.length,
      depth: nodes.reduce((max, n) => Math.max(max, n.level), 1),
      lastParsed: new Date().toISOString(),
    },
  };
}

/**
 * Type/label a hierarchy edge (Enhancement 4):
 *   Vibe/Pro track branch → 'track' (colored, animated, labeled)
 *   衔接 transition step   → 'flow' animated
 *   tool heading node      → 'expansion'
 *   everything else        → 'flow'
 */
function makeHierarchyEdge(parent: DocNode, child: DocNode): DocEdge {
  const base = { id: `edge-${parent.id}-${child.id}`, source: parent.id, target: child.id };

  if (child.type === 'track') {
    return {
      ...base,
      type: 'track',
      label: child.track === 'vibe' ? 'Vibe' : 'Pro',
      animated: true,
    };
  }
  if (child.type === 'step') {
    return { ...base, type: 'flow', animated: true };
  }
  if (child.type === 'tool' || child.type === 'prompt') {
    return { ...base, type: 'expansion', animated: false };
  }
  return { ...base, type: 'flow', animated: false };
}
