/**
 * Deep readiness endpoint for an external synthetic probe or Nginx monitoring.
 * GET /api/health verifies the registry, document parsing, and runtime directories.
 */
import { NextResponse } from 'next/server';
import { accessSync, constants, readFileSync, statSync } from 'fs';
import { extractMarkdownSections } from '@/lib/markdown/sections';
import { listDocumentEntries, type DocumentEntry } from '@/lib/shared/document-registry';
import { getWritePolicy } from '@/lib/server/write-guard';
import { projectPath } from '@/lib/server/project-root';

const REQUIRED_DIRECTORIES = [
  'documents',
  'documents/user',
  'data/canvases',
  'data/canvas-states',
  'data/evolution-audit',
] as const;

function checkDocument(entry: DocumentEntry) {
  let accessible = false;
  let parseable = false;

  try {
    const fullPath = projectPath(entry.path);
    accessSync(fullPath, constants.R_OK);
    if (!statSync(fullPath).isFile()) throw new Error('not a regular file');
    accessible = true;
    parseable = extractMarkdownSections(readFileSync(fullPath, 'utf8')).length > 0;
  } catch {
    // Readiness responses expose only the failed check, never host paths/errors.
  }

  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    accessible,
    parseable,
    path: entry.path,
  };
}

function checkDirectory(path: string, writableRequired: boolean) {
  let ok = false;
  try {
    const fullPath = projectPath(path);
    if (!statSync(fullPath).isDirectory()) throw new Error('not a directory');
    accessSync(fullPath, constants.R_OK | constants.X_OK | (writableRequired ? constants.W_OK : 0));
    ok = true;
  } catch {
    // Do not return absolute paths, permissions, or host error strings.
  }
  return { path: `./${path}`, writableRequired, ok };
}

export async function GET() {
  const writePolicy = getWritePolicy();
  let registryOk = true;
  let entries: DocumentEntry[] = [];

  try {
    entries = listDocumentEntries();
  } catch {
    registryOk = false;
  }

  const documents = entries.map(checkDocument);
  const directories = REQUIRED_DIRECTORIES.map(path => checkDirectory(path, writePolicy.writable));
  const ready = registryOk
    && documents.length >= 3
    && documents.every(document => document.accessible && document.parseable)
    && directories.every(directory => directory.ok);

  return NextResponse.json(
    {
      status: ready ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      writePolicy,
      checks: {
        registry: { ok: registryOk },
        directories,
      },
      documents,
    },
    { status: ready ? 200 : 503 }
  );
}
