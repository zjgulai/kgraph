import { cpSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

export default function globalSetup() {
  const project = resolve(process.cwd());
  const root = join(tmpdir(), 'doccanvas-playwright-root');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true, mode: 0o750 });
  cpSync(join(project, 'documents'), join(root, 'documents'), { recursive: true });
  const fixedTime = new Date('2026-07-15T08:00:00.000Z');
  for (const name of ['VibeTrack.md', 'v2.7-Pro.md', 'Playbook-v2.md']) {
    utimesSync(join(root, 'documents', name), fixedTime, fixedTime);
  }
  for (const directory of [
    'documents/user',
    'data/canvases',
    'data/canvas-states',
    'data/evolution-audit',
    'data/presentation',
    'data/revisions',
    'data/transactions',
    'data/revision-audit',
    'data/assets/portraits',
    'data/secrets',
  ]) mkdirSync(join(root, directory), { recursive: true, mode: 0o750 });
  writeFileSync(join(root, 'data/canvases/manifest.json'), '{"canvases":[]}\n', { mode: 0o640 });
  writeFileSync(join(root, 'data/secrets/owner-token'), 'playwright-owner-token\n', { mode: 0o600 });
  writeFileSync(join(root, 'data/secrets/session-secret'), 'playwright-session-secret-with-at-least-32-bytes\n', { mode: 0o600 });
}
