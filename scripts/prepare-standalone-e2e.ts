import { cpSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';

const root = process.cwd();
const standalone = resolve(root, '.next/standalone');
const server = resolve(standalone, 'server.js');
if (!existsSync(server)) throw new Error('Standalone build is missing. Run npm run build first.');

for (const [source, destination] of [
  [resolve(root, '.next/static'), resolve(standalone, '.next/static')],
  [resolve(root, 'public'), resolve(standalone, 'public')],
] as const) {
  if (!existsSync(source)) throw new Error(`Standalone asset source is missing: ${source}`);
  rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true });
}

console.log('standalone_e2e_assets_ready=true');
