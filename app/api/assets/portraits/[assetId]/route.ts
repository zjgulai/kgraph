import { NextRequest, NextResponse } from 'next/server';
import { deletePortrait, readPortrait } from '@/lib/server/portrait-assets';
import { checkWriteAccess } from '@/lib/server/write-guard';

function validAssetId(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  if (!validAssetId(assetId)) return NextResponse.json({ error: 'Invalid portrait asset id.' }, { status: 400 });
  const image = readPortrait(assetId);
  if (!image) return NextResponse.json({ error: 'Portrait not found.' }, { status: 404 });
  const body = image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(image.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  const { assetId } = await context.params;
  if (!validAssetId(assetId)) return NextResponse.json({ error: 'Invalid portrait asset id.' }, { status: 400 });
  try {
    deletePortrait(assetId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portrait deletion failed.';
    return NextResponse.json({ error: message }, { status: /referenced/i.test(message) ? 409 : 500 });
  }
}
