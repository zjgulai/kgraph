import { notFound } from 'next/navigation';
import { FactoryRelationExportFixture } from '@/components/canvas/FactoryRelationExportFixture';

export const dynamic = 'force-dynamic';

export default function FactoryRelationExportFixturePage() {
  if (process.env.DOCCANVAS_ENABLE_E2E_FIXTURES !== '1') notFound();
  return <FactoryRelationExportFixture />;
}
