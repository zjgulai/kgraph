/**
 * Deep readiness endpoint for an external synthetic probe or Nginx monitoring.
 * GET /api/health verifies the registry, document parsing, and runtime directories.
 */
import { createHealthHandler } from '@/lib/server/health-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = createHealthHandler();
