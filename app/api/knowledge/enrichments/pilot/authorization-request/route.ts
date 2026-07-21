import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredPilotAuthorizationRequest } from '@/lib/server/knowledge-enrichment-authorization-request';
import { checkWriteAccess } from '@/lib/server/write-guard';

export async function GET(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  return NextResponse.json({ request: getConfiguredPilotAuthorizationRequest() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
