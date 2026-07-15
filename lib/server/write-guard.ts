import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import type { NextRequest } from 'next/server';

export type WritePolicy =
  | { mode: 'dev'; writable: true; tokenRequired: false }
  | { mode: 'owner'; writable: true; tokenRequired: true }
  | { mode: 'readonly'; writable: false; tokenRequired: false };

export const OWNER_SESSION_COOKIE = 'doccanvas_owner_session';
export const OWNER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

interface OwnerSessionPayload {
  version: 1;
  expiresAt: number;
  nonce: string;
}

function configuredSecret(fileVariable: string, inlineVariable: string): string | undefined {
  const filePath = process.env[fileVariable];
  if (filePath) {
    const value = readFileSync(filePath, 'utf8').trim();
    return value || undefined;
  }
  const inline = process.env[inlineVariable]?.trim();
  return inline || undefined;
}

function ownerToken(): string | undefined {
  return configuredSecret('DOCCANVAS_ADMIN_TOKEN_FILE', 'DOCCANVAS_ADMIN_TOKEN');
}

function sessionSecret(): string | undefined {
  return configuredSecret('DOCCANVAS_SESSION_SECRET_FILE', 'DOCCANVAS_SESSION_SECRET');
}

function safeTokenEquals(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signature(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function getWritePolicy(): WritePolicy {
  const configured = process.env.DOCCANVAS_WRITE_MODE;
  if (configured === 'owner') return { mode: 'owner', writable: true, tokenRequired: true };
  if (process.env.NODE_ENV === 'production') return { mode: 'readonly', writable: false, tokenRequired: false };
  return { mode: 'dev', writable: true, tokenRequired: false };
}

export function ownerRuntimeReady(): boolean {
  return Boolean(ownerToken() && sessionSecret());
}

export function verifyOwnerToken(provided: string): boolean {
  const expected = ownerToken();
  return Boolean(expected && provided && safeTokenEquals(provided, expected));
}

export function createOwnerSession(now = Date.now()): string {
  const secret = sessionSecret();
  if (!secret) throw new Error('Owner session secret is not configured.');
  const payload: OwnerSessionPayload = {
    version: 1,
    expiresAt: now + OWNER_SESSION_MAX_AGE_SECONDS * 1000,
    nonce: randomBytes(18).toString('base64url'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifyOwnerSession(value: string | undefined, now = Date.now()): boolean {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const [encoded, providedSignature, extra] = value.split('.');
  if (!encoded || !providedSignature || extra !== undefined) return false;
  const expectedSignature = signature(encoded, secret);
  if (!safeTokenEquals(providedSignature, expectedSignature)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<OwnerSessionPayload>;
    return payload.version === 1
      && Number.isSafeInteger(payload.expiresAt)
      && (payload.expiresAt as number) > now
      && typeof payload.nonce === 'string'
      && payload.nonce.length >= 16;
  } catch {
    return false;
  }
}

export function requestHasOwnerSession(req: NextRequest): boolean {
  const policy = getWritePolicy();
  if (policy.mode === 'dev') return true;
  if (policy.mode !== 'owner') return false;
  return verifyOwnerSession(req.cookies.get(OWNER_SESSION_COOKIE)?.value);
}

function networkRequestOrigin(req: NextRequest): string | undefined {
  const forwardedProtocol = req.headers.get('x-forwarded-proto');
  if (forwardedProtocol?.includes(',')) return undefined;
  const protocol = forwardedProtocol?.trim() || req.nextUrl.protocol.slice(0, -1);
  if (protocol !== 'http' && protocol !== 'https') return undefined;

  const host = req.headers.get('host')?.trim();
  if (!host) return req.nextUrl.origin;
  if (!/^[A-Za-z0-9.[\]:-]+$/.test(host)) return undefined;
  try {
    const url = new URL(`${protocol}://${host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function sameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (origin) return origin === networkRequestOrigin(req);
  const fetchSite = req.headers.get('sec-fetch-site');
  return fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none';
}

export function checkWriteAccess(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const policy = getWritePolicy();
  if (!policy.writable) {
    return { ok: false, status: 403, message: 'DocCanvas is read-only in production.' };
  }
  if (policy.mode === 'dev') return { ok: true };
  if (!ownerRuntimeReady()) {
    return { ok: false, status: 503, message: 'Owner mode is not fully configured.' };
  }
  if (!sameOriginRequest(req)) {
    return { ok: false, status: 403, message: 'Cross-origin write request rejected.' };
  }
  if (!requestHasOwnerSession(req)) {
    return { ok: false, status: 401, message: 'Owner session required.' };
  }
  return { ok: true };
}
