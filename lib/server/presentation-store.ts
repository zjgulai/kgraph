import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  createPresentationSidecar,
  parsePresentationSidecar,
  type DocumentPresentationSidecar,
} from '@/lib/canvas/presentation-sidecar';
import { projectPath } from './project-root';

const PRESENTATION_DIR = 'data/presentation';

export function documentContentHash(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex');
}

export function presentationSidecarPath(documentId: string): string {
  return projectPath(join(PRESENTATION_DIR, `${documentId}.json`));
}

export function readPresentationSidecar(
  documentId: string,
  markdown: string,
): DocumentPresentationSidecar {
  const hash = documentContentHash(markdown);
  const filePath = presentationSidecarPath(documentId);
  if (!existsSync(filePath)) return createPresentationSidecar(documentId, hash);
  const sidecar = parsePresentationSidecar(JSON.parse(readFileSync(filePath, 'utf8')));
  if (sidecar.documentId !== documentId) throw new Error('Presentation sidecar documentId mismatch.');
  return sidecar;
}
