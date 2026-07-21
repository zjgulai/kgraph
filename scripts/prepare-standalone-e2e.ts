import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';

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

const knowledgeSource = resolve(root, '../product/knowledge-object-fixtures/shared-knowledge-v1-candidate-pack.json');
const knowledgeDestination = resolve(standalone, 'knowledge/shared-knowledge-v1-candidate-pack.json');
if (!existsSync(knowledgeSource)) throw new Error(`Knowledge candidate pack is missing: ${knowledgeSource}`);
mkdirSync(dirname(knowledgeDestination), { recursive: true });
copyFileSync(knowledgeSource, knowledgeDestination);

console.log('standalone_e2e_assets_ready=true');
