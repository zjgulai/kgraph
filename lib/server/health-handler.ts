import { accessSync, constants, statSync } from 'node:fs';
import { NextResponse } from 'next/server';
import {
  createDocumentReadinessCache,
  type DocumentReadinessCache,
} from '@/lib/server/document-readiness-cache';
import { projectPath } from '@/lib/server/project-root';
import { getWritePolicy, ownerRuntimeReady } from '@/lib/server/write-guard';
import { listDocumentEntries, type DocumentEntry } from '@/lib/shared/document-registry';

const REQUIRED_DIRECTORIES = [
  'documents',
  'documents/user',
  'data/canvases',
  'data/canvas-states',
  'data/evolution-audit',
  'data/presentation',
  'data/revisions',
  'data/transactions',
  'data/revision-audit',
  'data/assets/portraits',
] as const;

function checkDocument(
  entry: DocumentEntry,
  fullPath: string,
  readinessCache: DocumentReadinessCache,
) {
  const { accessible, parseable } = readinessCache.check(fullPath);
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

export function createHealthHandler(
  documentReadinessCache: DocumentReadinessCache = createDocumentReadinessCache(),
) {
  return async function getHealth() {
    const writePolicy = getWritePolicy();
    const writePolicyConfigured = writePolicy.mode !== 'owner' || ownerRuntimeReady();
    let registryOk = true;
    let entries: DocumentEntry[] = [];

    try {
      entries = listDocumentEntries();
    } catch {
      registryOk = false;
    }

    const activeDocumentPaths = entries.map(entry => projectPath(entry.path));
    const documents = entries.map((entry, index) => (
      checkDocument(entry, activeDocumentPaths[index], documentReadinessCache)
    ));
    documentReadinessCache.retain(activeDocumentPaths);
    const directories = REQUIRED_DIRECTORIES.map(path => checkDirectory(path, writePolicy.writable));
    const ready = registryOk
      && writePolicyConfigured
      && documents.length >= 3
      && documents.every(document => document.accessible && document.parseable)
      && directories.every(directory => directory.ok);

    return NextResponse.json(
      {
        status: ready ? 'ok' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        writePolicy: { ...writePolicy, configured: writePolicyConfigured },
        checks: {
          registry: { ok: registryOk },
          directories,
        },
        documents,
      },
      {
        status: ready ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  };
}
