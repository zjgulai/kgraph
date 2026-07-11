import { resolve } from 'path';

export function projectRoot(): string {
  return resolve(process.env.DOCCANVAS_ROOT || process.cwd());
}

export function projectPath(...segments: string[]): string {
  return resolve(projectRoot(), ...segments);
}
