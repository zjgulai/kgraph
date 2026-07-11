import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

export type WritePolicy =
  | { mode: 'dev'; writable: true; tokenRequired: false }
  | { mode: 'owner'; writable: true; tokenRequired: true }
  | { mode: 'readonly'; writable: false; tokenRequired: false };

export function getWritePolicy(): WritePolicy {
  const configured = process.env.DOCCANVAS_WRITE_MODE;

  if (configured === 'owner') {
    return { mode: 'owner', writable: true, tokenRequired: true };
  }

  if (process.env.NODE_ENV === 'production') {
    return { mode: 'readonly', writable: false, tokenRequired: false };
  }

  return { mode: 'dev', writable: true, tokenRequired: false };
}

function safeTokenEquals(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function checkWriteAccess(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  const policy = getWritePolicy();
  if (!policy.writable) {
    return { ok: false, status: 403, message: 'DocCanvas is read-only in production. Set DOCCANVAS_WRITE_MODE=owner to enable writes.' };
  }

  if (!policy.tokenRequired) return { ok: true };

  const expected = process.env.DOCCANVAS_ADMIN_TOKEN;
  if (!expected) {
    return { ok: false, status: 503, message: 'Write mode requires DOCCANVAS_ADMIN_TOKEN.' };
  }

  const provided = req.headers.get('x-doccanvas-token') || '';
  if (!provided || !safeTokenEquals(provided, expected)) {
    return { ok: false, status: 401, message: 'Valid X-DocCanvas-Token required.' };
  }

  return { ok: true };
}
