import { createHash, randomUUID } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { projectPath } from './project-root';

const PORTRAIT_DIR = 'data/assets/portraits';
const PRESENTATION_DIR = 'data/presentation';
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 12_000_000;

export interface PortraitAsset {
  id: string;
  width: 800;
  height: 1000;
  format: 'webp';
  bytes: number;
  createdAt: string;
  url: string;
}

export function portraitPath(assetId: string): string {
  if (!/^[a-f0-9]{64}$/.test(assetId)) throw new Error('Invalid portrait asset id.');
  return projectPath(join(PORTRAIT_DIR, `${assetId}.webp`));
}

export async function normalizePortrait(input: Buffer): Promise<Buffer> {
  if (input.byteLength === 0 || input.byteLength > MAX_INPUT_BYTES) {
    throw new Error('Portrait must be between 1 byte and 5 MiB.');
  }
  const image = sharp(input, { failOn: 'warning', limitInputPixels: MAX_INPUT_PIXELS });
  const metadata = await image.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error('Portrait must be a JPEG, PNG, or WebP image.');
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INPUT_PIXELS) {
    throw new Error('Portrait exceeds the 12 megapixel limit.');
  }
  return image
    .rotate()
    .resize(800, 1000, { fit: 'cover', position: 'attention', withoutEnlargement: false })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

export async function storePortrait(input: Buffer): Promise<PortraitAsset> {
  const normalized = await normalizePortrait(input);
  const id = createHash('sha256').update(normalized).digest('hex');
  const filePath = portraitPath(id);
  mkdirSync(projectPath(PORTRAIT_DIR), { recursive: true, mode: 0o750 });
  if (!existsSync(filePath)) {
    const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tempPath, normalized, { mode: 0o640 });
    renameSync(tempPath, filePath);
  }
  return portraitAssetFromPath(id, filePath);
}

function portraitAssetFromPath(id: string, filePath: string): PortraitAsset {
  const stat = statSync(filePath);
  return {
    id,
    width: 800,
    height: 1000,
    format: 'webp',
    bytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
    url: `/api/assets/portraits/${id}`,
  };
}

export function listPortraitAssets(): PortraitAsset[] {
  const directory = projectPath(PORTRAIT_DIR);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter(name => /^[a-f0-9]{64}\.webp$/.test(name))
    .map(name => {
      const id = name.slice(0, -'.webp'.length);
      return portraitAssetFromPath(id, join(directory, name));
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function readPortrait(assetId: string): Buffer | null {
  const filePath = portraitPath(assetId);
  return existsSync(filePath) ? readFileSync(filePath) : null;
}

export function portraitIsReferenced(assetId: string): boolean {
  const directory = projectPath(PRESENTATION_DIR);
  if (!existsSync(directory)) return false;
  return readdirSync(directory)
    .filter(name => name.endsWith('.json'))
    .some(name => readFileSync(join(directory, name), 'utf8').includes(assetId));
}

export function deletePortrait(assetId: string): void {
  if (portraitIsReferenced(assetId)) throw new Error('Portrait is still referenced by a module.');
  rmSync(portraitPath(assetId), { force: true });
}
