import { NextRequest, NextResponse } from 'next/server';
import { listPortraitAssets, storePortrait } from '@/lib/server/portrait-assets';
import { checkWriteAccess } from '@/lib/server/write-guard';

export async function GET(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  return NextResponse.json({ assets: listPortraitAssets() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const access = checkWriteAccess(req);
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });
  try {
    const form = await req.formData();
    const file = form.get('portrait');
    if (!(file instanceof File)) return NextResponse.json({ error: 'portrait file required.' }, { status: 400 });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return NextResponse.json({ error: 'Portrait must be JPEG, PNG, or WebP.' }, { status: 415 });
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Portrait must be no larger than 5 MiB.' }, { status: 413 });
    }
    const asset = await storePortrait(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portrait upload failed.';
    return NextResponse.json({ error: message }, { status: /must|exceeds/i.test(message) ? 400 : 500 });
  }
}
