import { NextResponse } from 'next/server';
import { getConfiguredPilotReadiness } from '@/lib/server/knowledge-enrichment-pilot';

export async function GET() {
  return NextResponse.json({ pilot: getConfiguredPilotReadiness() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
