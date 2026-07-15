import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import {
  deletePortrait,
  listPortraitAssets,
  normalizePortrait,
  portraitIsReferenced,
  readPortrait,
  storePortrait,
} from '../lib/server/portrait-assets';

let root = '';
const previousRoot = process.env.DOCCANVAS_ROOT;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'doccanvas-portraits-'));
  process.env.DOCCANVAS_ROOT = root;
});

after(() => {
  if (previousRoot === undefined) delete process.env.DOCCANVAS_ROOT;
  else process.env.DOCCANVAS_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

test('portrait pipeline validates, strips metadata, and normalizes to 4:5 WebP', async () => {
  const source = await sharp({
    create: { width: 320, height: 180, channels: 3, background: { r: 72, g: 96, b: 78 } },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const normalized = await normalizePortrait(source);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 1000);
  assert.equal(metadata.exif, undefined);

  const asset = await storePortrait(source);
  assert.match(asset.id, /^[a-f0-9]{64}$/);
  assert.equal(asset.width, 800);
  assert.equal(asset.height, 1000);
  assert.ok(readPortrait(asset.id));
  assert.equal(listPortraitAssets().length, 1);
});

test('referenced portrait cannot be deleted and invalid input fails closed', async () => {
  await assert.rejects(() => normalizePortrait(Buffer.from('not an image')));
  const asset = listPortraitAssets()[0];
  mkdirSync(join(root, 'data', 'presentation'), { recursive: true });
  writeFileSync(join(root, 'data', 'presentation', 'fixture.json'), JSON.stringify({ portraitAssetId: asset.id }), 'utf8');
  assert.equal(portraitIsReferenced(asset.id), true);
  assert.throws(() => deletePortrait(asset.id), /still referenced/i);
  rmSync(join(root, 'data', 'presentation', 'fixture.json'));
  deletePortrait(asset.id);
  assert.equal(readPortrait(asset.id), null);
});
