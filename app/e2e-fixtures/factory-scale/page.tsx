import { notFound } from 'next/navigation';
import { FactoryScaleFixture } from '@/components/canvas/FactoryScaleFixture';

export const dynamic = 'force-dynamic';

export default function FactoryScaleFixturePage() {
  if (process.env.DOCCANVAS_ENABLE_E2E_FIXTURES !== '1') notFound();
  return <FactoryScaleFixture />;
}
