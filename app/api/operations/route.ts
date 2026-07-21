import { NextResponse } from 'next/server';
import { ArtifactCatalogError } from '@/lib/server/artifact-catalog';
import { BlueprintWorkspaceError } from '@/lib/server/blueprint-workspace-store';
import { loadProductOperationsProjection } from '@/lib/server/product-operations';

export async function GET() {
  try {
    return NextResponse.json(loadProductOperationsProjection(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof ArtifactCatalogError || error instanceof BlueprintWorkspaceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Operations projection failed.' }, { status: 500 });
  }
}
