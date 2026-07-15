import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/server/parse-json-body';
import {
  createOwnerSession,
  getWritePolicy,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_MAX_AGE_SECONDS,
  ownerRuntimeReady,
  requestHasOwnerSession,
  verifyOwnerToken,
} from '@/lib/server/write-guard';

const LoginSchema = z.object({ token: z.string().min(1).max(512) }).strict();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, number[]>();

function clientKey(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'local';
}

function consumeAttempt(key: string, now: number): boolean {
  const recent = (attempts.get(key) ?? []).filter(timestamp => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(key, recent);
    return false;
  }
  attempts.set(key, [...recent, now]);
  return true;
}

function clearAttempts(key: string): void {
  attempts.delete(key);
}

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  return !origin || origin === req.nextUrl.origin;
}

export async function GET(req: NextRequest) {
  const policy = getWritePolicy();
  return NextResponse.json({
    mode: policy.mode,
    writable: policy.writable,
    authenticated: requestHasOwnerSession(req),
    configured: policy.mode !== 'owner' || ownerRuntimeReady(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const policy = getWritePolicy();
  if (policy.mode === 'readonly') return NextResponse.json({ error: 'DocCanvas is read-only in production.' }, { status: 403 });
  if (policy.mode === 'dev') return NextResponse.json({ authenticated: true, mode: 'dev' });
  if (!originAllowed(req)) return NextResponse.json({ error: 'Cross-origin login request rejected.' }, { status: 403 });
  if (!ownerRuntimeReady()) return NextResponse.json({ error: 'Owner mode is not fully configured.' }, { status: 503 });

  const key = clientKey(req);
  const now = Date.now();
  if (!consumeAttempt(key, now)) return NextResponse.json({ error: 'Too many owner login attempts.' }, { status: 429 });
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid owner login payload.' }, { status: 400 });
  const parsed = LoginSchema.safeParse(body.value);
  if (!parsed.success || !verifyOwnerToken(parsed.data.token)) {
    return NextResponse.json({ error: 'Owner token is invalid.' }, { status: 401 });
  }

  clearAttempts(key);
  const response = NextResponse.json({ authenticated: true, mode: 'owner' });
  response.cookies.set(OWNER_SESSION_COOKIE, createOwnerSession(now), {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: OWNER_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  if (!originAllowed(req)) return NextResponse.json({ error: 'Cross-origin logout request rejected.' }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OWNER_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
