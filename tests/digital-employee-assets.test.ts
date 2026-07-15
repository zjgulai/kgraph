import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { FACTORY_EMPLOYEE_ROLES } from '../lib/canvas/factory-presentation';

const root = resolve(import.meta.dirname, '..');
const component = readFileSync(resolve(root, 'components/canvas/DigitalEmployee.tsx'), 'utf8');

test('all eight synthetic employee portraits are stable WebP assets under the first-screen budget', () => {
  assert.equal(FACTORY_EMPLOYEE_ROLES.length, 8);
  assert.equal(new Set(FACTORY_EMPLOYEE_ROLES.map(role => role.portraitKey)).size, 8);

  for (const role of FACTORY_EMPLOYEE_ROLES) {
    const assetPath = resolve(root, 'public/digital-employees', `${role.portraitKey}.webp`);
    const bytes = readFileSync(assetPath);
    assert.ok(statSync(assetPath).size <= 140 * 1024, `${role.portraitKey} exceeds 140KB`);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
  }
});

test('digital employee resolves the canonical portrait path and keeps a failure fallback', () => {
  assert.match(component, /`\/digital-employees\/\$\{employee\.portraitKey\}\.webp`/u);
  assert.match(component, /onError=\{\(\) => setPortraitFailed\(true\)\}/u);
  assert.match(component, /digital-employee__fallback/u);
  assert.match(component, /sizes=\{compact \? '64px' : '160px'\}/u);
});
