import { notFound } from 'next/navigation';
import { DesignSystemFixture } from '@/components/ui/DesignSystemFixture';

export const dynamic = 'force-dynamic';

export default function DesignSystemFixturePage() {
  if (process.env.DOCCANVAS_ENABLE_E2E_FIXTURES !== '1') notFound();
  return <DesignSystemFixture />;
}
