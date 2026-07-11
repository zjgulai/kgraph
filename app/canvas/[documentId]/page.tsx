/**
 * app/canvas/[documentId]/page.tsx — Canvas viewer for a specific document
 *
 * Server Component: loads the Markdown file, parses it into a DocCanvas graph,
 * and renders the interactive React Flow canvas.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, FileQuestion } from 'lucide-react';
import { CanvasClientWrapper } from '@/components/canvas/CanvasClientWrapper';
import { parseMarkdownToGraph } from '@/lib/parser/markdown-to-graph';
import { computeLayout } from '@/lib/canvas/layout-engine';
import { getDocumentEntry } from '@/lib/shared/document-registry';
import { projectPath } from '@/lib/server/project-root';
import { getWritePolicy } from '@/lib/server/write-guard';

export default async function CanvasPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const docConfig = getDocumentEntry(documentId);
  if (!docConfig) notFound();

  const filePath = projectPath(docConfig.path);

  if (!existsSync(filePath)) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <FileQuestion className="w-8 h-8 text-zinc-600" />
          </div>
          <p className="text-zinc-400 text-lg mb-2">文档文件不存在</p>
          <p className="text-zinc-600 text-xs font-mono max-w-md mx-auto break-all">{filePath}</p>
          <Link href="/" className="inline-block mt-6 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors">返回工作台</Link>
        </div>
      </div>
    );
  }

  const markdown = readFileSync(filePath, 'utf-8');
  const graph = parseMarkdownToGraph(markdown, documentId, filePath);

  if (graph.nodes.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-amber-500" />
          </div>
          <p className="text-lg text-zinc-300 mb-2">该文档暂无内容</p>
          <p className="text-sm text-zinc-500 font-mono break-all">{filePath}</p>
          <p className="text-xs text-zinc-600 mt-2">文档已读取（{markdown.length.toLocaleString()} 字符），但未解析出任何节点。</p>
          <Link href="/" className="inline-block mt-6 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm transition-colors">返回工作台</Link>
        </div>
      </div>
    );
  }

  const layout = computeLayout(graph.nodes, graph.edges);
  for (const pos of layout.nodes) {
    const node = graph.nodes.find(n => n.id === pos.id);
    if (node) node.position = pos.position;
  }

  // Attach file metadata so the canvas header can show last-modified time
  const fileStat = statSync(filePath);
  (graph as any)._file = { mtime: fileStat.mtime.toISOString(), path: docConfig.path, bytes: markdown.length };

  return <CanvasClientWrapper document={graph} writePolicy={getWritePolicy()} />;
}
