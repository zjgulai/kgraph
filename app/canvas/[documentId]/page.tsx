/**
 * app/canvas/[documentId]/page.tsx — Canvas viewer for a specific document
 *
 * Server Component: loads the Markdown file, parses it into a DocCanvas graph,
 * and renders the interactive SVG + DOM factory canvas.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, FileQuestion } from 'lucide-react';
import { CanvasClientWrapper } from '@/components/canvas/CanvasClientWrapper';
import { parseMarkdownToGraph } from '@/lib/parser/markdown-to-graph';
import { applyDocumentSidecar } from '@/lib/canvas/presentation-sidecar';
import { getDocumentEntry } from '@/lib/shared/document-registry';
import { projectPath } from '@/lib/server/project-root';
import { documentContentHash, readPresentationSidecar } from '@/lib/server/presentation-store';
import { getWritePolicy } from '@/lib/server/write-guard';

export default async function CanvasPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const docConfig = getDocumentEntry(documentId);
  if (!docConfig) notFound();

  const filePath = projectPath(docConfig.path);

  if (!existsSync(filePath)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#F8FBF0]">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-[#D5DFD0] bg-white">
            <FileQuestion className="h-8 w-8 text-[#637064]" />
          </div>
          <p className="mb-2 text-lg font-semibold text-[#182019]">文档文件不存在</p>
          <p className="mx-auto max-w-md break-all font-mono text-xs text-[#637064]">{filePath}</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-[#355C45] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#294A36]">返回工作台</Link>
        </div>
      </div>
    );
  }

  const markdown = readFileSync(filePath, 'utf-8');
  const presentation = readPresentationSidecar(documentId, markdown);
  const graph = applyDocumentSidecar(
    parseMarkdownToGraph(markdown, documentId, filePath),
    presentation,
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#F8FBF0]">
        <div className="text-center max-w-md px-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-[#E6CFAE] bg-[#FBF2E5]">
            <AlertTriangle className="h-8 w-8 text-[#9A5B12]" />
          </div>
          <p className="mb-2 text-lg font-semibold text-[#182019]">该文档暂无内容</p>
          <p className="break-all font-mono text-sm text-[#637064]">{filePath}</p>
          <p className="mt-2 text-xs text-[#637064]">文档已读取（{markdown.length.toLocaleString()} 字符），但未解析出任何节点。</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-[#355C45] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#294A36]">返回工作台</Link>
        </div>
      </div>
    );
  }

  // Attach file metadata so the canvas header can show last-modified time
  const fileStat = statSync(filePath);
  (graph as any)._file = { mtime: fileStat.mtime.toISOString(), path: docConfig.path, bytes: markdown.length };

  return (
    <CanvasClientWrapper
      document={graph}
      documentHash={documentContentHash(markdown)}
      presentation={presentation}
      writePolicy={getWritePolicy()}
    />
  );
}
