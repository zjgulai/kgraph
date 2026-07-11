import type { Metadata } from 'next';
import { WorkspaceDashboard } from '@/components/canvas/WorkspaceDashboard';
import { listDocumentEntries } from '@/lib/shared/document-registry';
import { getWritePolicy } from '@/lib/server/write-guard';

export const metadata: Metadata = {
  title: 'DocCanvas 工作台',
  description: 'Markdown-first knowledge canvas for AI product Playbook documents',
};

export const dynamic = 'force-dynamic';

export default function Home() {
  return <WorkspaceDashboard initialEntries={listDocumentEntries()} writePolicy={getWritePolicy()} />;
}
