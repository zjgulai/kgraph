import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { atomicWriteJson, atomicWriteText, withFileLock } from '@/lib/server/file-ops';
import { projectPath } from '@/lib/server/project-root';
import { cleanPresentationText } from '@/lib/canvas/presentation-text';

export type DocumentKind = 'builtin' | 'user';

export interface DocumentEntry {
  id: string;
  kind: DocumentKind;
  title: string;
  subtitle: string;
  description: string;
  path: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
  exists: boolean;
  bytes?: number;
  mtime?: string;
}

const USER_CANVAS_DIR = 'documents/user';
const MANIFEST_DIR = 'data/canvases';
const MANIFEST_PATH = projectPath(MANIFEST_DIR, 'manifest.json');

const UserCanvasSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  title: z.string().min(1).max(120),
  description: z.string().max(500).default(''),
  path: z.string().regex(/^\.\/documents\/user\/[a-z0-9][a-z0-9-]{1,63}\.md$/),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ManifestSchema = z.object({
  canvases: z.array(UserCanvasSchema),
});

export const BUILTIN_DOCUMENTS: Array<Omit<DocumentEntry, 'exists' | 'bytes' | 'mtime'>> = [
  {
    id: 'vibe-track',
    kind: 'builtin',
    title: '骨干路线图 VibeTrack',
    subtitle: '零基础到产品上线',
    description: '默认路径。8 阶段 SOP 与可复制 Codex 提示词模板。',
    path: './documents/VibeTrack.md',
    color: '#6366f1',
  },
  {
    id: 'v2-pro',
    kind: 'builtin',
    title: '骨干路线图 v2.7 Pro',
    subtitle: '进阶参考与工具选型',
    description: '技术原型、商业分类和工具推荐模块的完整参考画布。',
    path: './documents/v2.7-Pro.md',
    color: '#f59e0b',
  },
  {
    id: 'playbook-v2',
    kind: 'builtin',
    title: '产品工厂操作系统 Playbook-v2',
    subtitle: 'AI Agent 可执行操作系统',
    description: '基因组系统、进化引擎、进化宪章和 17 个脚本的知识图谱。',
    path: './documents/Playbook-v2.md',
    color: '#10b981',
  },
];

export const DOCUMENT_MAP: Record<string, { title: string; path: string }> = Object.fromEntries(
  BUILTIN_DOCUMENTS.map(doc => [doc.id, { title: doc.title, path: doc.path }])
);

function withFileStats(entry: Omit<DocumentEntry, 'exists' | 'bytes' | 'mtime'>): DocumentEntry {
  const fullPath = projectPath(entry.path);
  if (!existsSync(fullPath)) return { ...entry, exists: false };
  const stat = statSync(fullPath);
  return { ...entry, exists: true, bytes: stat.size, mtime: stat.mtime.toISOString() };
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return { canvases: [] as z.infer<typeof UserCanvasSchema>[] };
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  return ManifestSchema.parse(JSON.parse(raw));
}

function slugify(input: string) {
  const ascii = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
  const fallback = `canvas-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  return (ascii || fallback).slice(0, 54).replace(/^-|-$/g, '') || fallback;
}

export function listDocumentEntries(): DocumentEntry[] {
  const builtins = BUILTIN_DOCUMENTS.map(withFileStats);
  const manifest = readManifest();
  const users = manifest.canvases.map(canvas => withFileStats({
    id: canvas.id,
    kind: 'user' as const,
    title: canvas.title,
    subtitle: '用户画布',
    description: canvas.description || 'Markdown 驱动的自定义知识画布。',
    path: canvas.path,
    color: '#818cf8',
    createdAt: canvas.createdAt,
    updatedAt: canvas.updatedAt,
  }));
  return [...builtins, ...users];
}

export function getDocumentEntry(documentId: string): DocumentEntry | undefined {
  return listDocumentEntries().find(doc => doc.id === documentId);
}

export function assertKnownDocument(documentId: string): DocumentEntry {
  const entry = getDocumentEntry(documentId);
  if (!entry) throw new Error(`Unknown documentId: ${documentId}`);
  return entry;
}

export async function createUserCanvas(input: { title: string; description?: string; slug?: string }) {
  const now = new Date().toISOString();
  const title = cleanPresentationText(input.title);
  if (!title) throw new Error('title required');

  return withFileLock(`${MANIFEST_PATH}.lock`, () => {
    const manifest = readManifest();
    const usedIds = new Set([...BUILTIN_DOCUMENTS.map(doc => doc.id), ...manifest.canvases.map(doc => doc.id)]);
    const base = slugify(input.slug || title);
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base.slice(0, 54)}-${suffix++}`;

    const path = `./${USER_CANVAS_DIR}/${id}.md`;
    const fullPath = projectPath(path);
    const description = cleanPresentationText(input.description);
    const markdown = [
      `# ${title}`,
      '',
      '## 画布说明',
      '',
      description || '在这里描述这个画布的目标、边界和使用方式。',
      '',
      '## 第一组节点',
      '',
      '从这里开始添加内容。每个二级或三级标题都会成为画布节点。',
      '',
      '### 待展开主题',
      '',
      '- 关键问题',
      '- 下一步行动',
      '',
    ].join('\n');

    atomicWriteText(fullPath, markdown);

    const canvas = UserCanvasSchema.parse({
      id,
      title,
      description,
      path,
      createdAt: now,
      updatedAt: now,
    });
    const next = { canvases: [...manifest.canvases, canvas] };
    atomicWriteJson(MANIFEST_PATH, next);
    return withFileStats({
      id,
      kind: 'user' as const,
      title,
      subtitle: '用户画布',
      description: description || 'Markdown 驱动的自定义知识画布。',
      path,
      color: '#818cf8',
      createdAt: now,
      updatedAt: now,
    });
  });
}
