import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const manualPath = resolve(process.cwd(), 'docs/product/doccanvas-product-review-and-role-manual.html');

test('D10 product review manual is a complete, navigable HTML artifact', () => {
  assert.equal(existsSync(manualPath), true, 'UI-097 HTML manual must exist');
  const html = readFileSync(manualPath, 'utf8');

  assert.match(html, /<html lang="zh-CN">/u);
  assert.match(html, /<title>DocCanvas 产品复盘、设计逻辑与角色使用手册<\/title>/u);
  assert.match(html, /<main id="main-content"/u);
  assert.match(html, /<nav[^>]+aria-label="文档目录"/u);
  assert.match(html, /production unchanged/u);
  assert.match(html, /local automated acceptance verified/u);

  const requiredSections = [
    'executive-summary',
    'product-positioning',
    'commercial-model',
    'product-chain',
    'design-logic',
    'architecture',
    'owner-manual',
    'reviewer-manual',
    'operator-manual',
    'module-roadmap',
    'release-boundary',
    'open-gaps',
  ];
  for (const id of requiredSections) {
    assert.match(html, new RegExp(`id="${id}"`, 'u'), `missing section: ${id}`);
    assert.match(html, new RegExp(`href="#${id}"`, 'u'), `missing TOC link: ${id}`);
  }

  const hrefTargets = [...html.matchAll(/href="#([^"]+)"/gu)].map(match => match[1]);
  for (const target of hrefTargets) {
    assert.match(html, new RegExp(`id="${target}"`, 'u'), `broken local anchor: ${target}`);
  }

  const imageSources = [...html.matchAll(/<img[^>]+src="([^"]+)"/gu)].map(match => match[1]);
  assert.ok(imageSources.length > 0, 'manual must include at least one real visual evidence asset');
  for (const source of imageSources) {
    assert.equal(existsSync(resolve(dirname(manualPath), source)), true, `missing image asset: ${source}`);
  }

  assert.match(html, /Owner/u);
  assert.match(html, /Reviewer/u);
  assert.match(html, /Operator/u);
  assert.match(html, /UI-014/u);
  assert.match(html, /UI-022/u);
  assert.match(html, /UI-029/u);
  assert.match(html, /UI-060/u);
  assert.match(html, /UI-072/u);
  assert.match(html, /UI-098/u);
  assert.match(html, /UI-099/u);

  assert.doesNotMatch(html, /(?:api[_-]?key|secret|token)\s*[:=]\s*[A-Za-z0-9_-]{16,}/iu);
  assert.doesNotMatch(html, /<script\b/iu, 'manual must remain offline-readable without scripts');
});
