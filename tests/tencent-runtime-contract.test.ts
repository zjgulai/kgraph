import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const helper = resolve(root, 'scripts/tencent/runtime-contract.sh');
const linuxVerifier = resolve(root, 'scripts/tencent/verify-runtime-contract-linux.sh');
const verifier = resolve(root, 'scripts/tencent/verify-linux-image.sh');

test('Tencent runtime helper makes missing Docker Health state nil-safe', () => {
  assert.equal(existsSync(helper), true, 'missing scripts/tencent/runtime-contract.sh');
  const source = readFileSync(helper, 'utf8');

  assert.match(source, /with \(index \.State "Health"\)/);
  assert.match(source, /index \. "Status"/);
  assert.match(source, /with \(index \.Config "Healthcheck"\)/);
  assert.match(source, /index \. "Test"/);
  assert.match(source, /readonly DOCCANVAS_DOCKER_HEALTH_STATUS_TEMPLATE=/);
  assert.match(source, /readonly DOCCANVAS_DOCKER_IMAGE_HEALTHCHECK_TEMPLATE=/);
  assert.match(source, /readonly DOCCANVAS_DOCKER_RUNTIME_STATE_TEMPLATE=/);
  assert.match(source, /doccanvas_docker_container_healthcheck_test\(\)/);
  assert.match(source, /doccanvas_docker_runtime_state\(\)/);
  assert.doesNotMatch(source, /if \.State\.Health|\.State\.Health\.Status|if \.Config\.Healthcheck/);

  const syntax = spawnSync('bash', ['-n', helper], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('Tencent runtime helper treats symlink aliases as the same lock file', (t: TestContext) => {
  const fixture = mkdtempSync(join(tmpdir(), 'doccanvas-runtime-lock-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const canonical = join(fixture, 'canonical.lock');
  const alias = join(fixture, 'alias.lock');
  const other = join(fixture, 'other.lock');
  writeFileSync(canonical, '');
  writeFileSync(other, '');
  symlinkSync(canonical, alias);

  const result = spawnSync(
    'bash',
    [
      '-c',
      'set -Eeuo pipefail\nsource "$1"\ndoccanvas_same_file "$2" "$3"\n! doccanvas_same_file "$2" "$4"',
      'bash',
      helper,
      canonical,
      alias,
      other,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
});

test('Tencent runtime helper verifies inherited flock by FD and canonical identity', () => {
  const source = readFileSync(helper, 'utf8');

  assert.match(source, /doccanvas_verify_inherited_lock_fd\(\)/);
  assert.match(source, /\/proc\/\$\$\/fd\/\$\{fd\}/);
  assert.match(source, /doccanvas_same_file/);
  assert.match(source, /flock -n --conflict-exit-code 75 "\$\{lock_file\}" true/);
  assert.match(source, /path_lock_status[^\n]*-eq 75/);
  assert.match(source, /flock -n --conflict-exit-code 75 "\$\{fd\}"/);
  assert.match(source, /fd_lock_status[^\n]*-eq 0/);
  assert.doesNotMatch(source, /readlink -f[^\n]*==[^\n]*lock_file/);
});

test('Linux runtime verifier covers inherited, unlocked, wrong-file, and third-party lock behavior', () => {
  assert.equal(existsSync(linuxVerifier), true, 'missing scripts/tencent/verify-runtime-contract-linux.sh');
  const source = readFileSync(linuxVerifier, 'utf8');

  assert.match(source, /\/proc\/self\/fd/);
  assert.match(source, /inherited_lock_alias=pass/);
  assert.match(source, /unlocked_fd_rejected=pass/);
  assert.match(source, /wrong_file_rejected=pass/);
  assert.match(source, /third_party_lock_rejected=pass/);
  assert.match(source, /doccanvas_verify_inherited_lock_fd/);
  const syntax = spawnSync('bash', ['-n', linuxVerifier], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('readonly image verifier consumes the shared nil-safe runtime contract', () => {
  const source = readFileSync(verifier, 'utf8');

  assert.match(source, /runtime-contract\.sh/);
  assert.match(source, /doccanvas_docker_image_healthcheck_test/);
  assert.match(source, /doccanvas_docker_health_status/);
  assert.doesNotMatch(source, /if \.State\.Health|\.State\.Health\.Status|if \.Config\.Healthcheck/);
});
