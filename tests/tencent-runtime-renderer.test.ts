import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const renderer = resolve(root, 'scripts/tencent/render-runtime-script.sh');
const runbook = resolve(root, 'deploy/tencent/PRODUCTION-RUNBOOK.md');

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'doccanvas-runtime-render-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function render(template: string, output: string) {
  return spawnSync('bash', [renderer, template, output], { encoding: 'utf8' });
}

test('runtime renderer creates a checksum-bound single-file script', (t) => {
  assert.equal(existsSync(renderer), true, 'missing scripts/tencent/render-runtime-script.sh');
  const directory = fixture(t);
  const template = join(directory, 'acceptance.template.sh');
  const output = join(directory, 'acceptance.sh');
  writeFileSync(template, `#!/usr/bin/env bash
set -Eeuo pipefail
# @doccanvas-runtime-contract
doccanvas_same_file "$1" "$2"
`);

  const result = render(template, output);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^output_sha256=[a-f0-9]{64}$/m);
  const rendered = readFileSync(output, 'utf8');
  assert.match(rendered, /doccanvas_docker_health_status\(\)/);
  assert.match(rendered, /doccanvas_docker_runtime_state\(\)/);
  assert.match(rendered, /doccanvas_verify_inherited_lock_fd\(\)/);
  assert.doesNotMatch(rendered, /@doccanvas-runtime-contract/);
  assert.equal(rendered.match(/^#!/gm)?.length, 1);
  assert.equal(statSync(output).mode & 0o777, 0o750);
  const syntax = spawnSync('bash', ['-n', output], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('runtime renderer rejects missing or duplicate markers and existing output', (t) => {
  const directory = fixture(t);
  const output = join(directory, 'acceptance.sh');
  const missing = join(directory, 'missing.template.sh');
  writeFileSync(missing, '#!/usr/bin/env bash\ntrue\n');
  const missingResult = render(missing, output);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stderr, /exactly one runtime contract marker/);
  assert.equal(existsSync(output), false);

  const duplicate = join(directory, 'duplicate.template.sh');
  writeFileSync(duplicate, '# @doccanvas-runtime-contract\n# @doccanvas-runtime-contract\n');
  const duplicateResult = render(duplicate, output);
  assert.notEqual(duplicateResult.status, 0);
  assert.match(duplicateResult.stderr, /exactly one runtime contract marker/);
  assert.equal(existsSync(output), false);

  const valid = join(directory, 'valid.template.sh');
  writeFileSync(valid, '#!/usr/bin/env bash\n# @doccanvas-runtime-contract\ntrue\n');
  writeFileSync(output, 'owner evidence\n');
  chmodSync(output, 0o640);
  const existingResult = render(valid, output);
  assert.notEqual(existingResult.status, 0);
  assert.match(existingResult.stderr, /output already exists/);
  assert.equal(readFileSync(output, 'utf8'), 'owner evidence\n');
});

test('runtime renderer rejects direct optional Docker field access', (t) => {
  const directory = fixture(t);
  for (const [name, unsafe] of [
    ['state', '{{if .State.Health}}{{.State.Health.Status}}{{end}}'],
    ['config', '{{if .Config.Healthcheck}}{{json .Config.Healthcheck.Test}}{{end}}'],
  ] as const) {
    const template = join(directory, `${name}.template.sh`);
    const output = join(directory, `${name}.sh`);
    writeFileSync(template, `#!/usr/bin/env bash
# @doccanvas-runtime-contract
docker inspect -f '${unsafe}' fixture
`);
    const result = render(template, output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe direct Docker optional-field access/);
    assert.equal(existsSync(output), false);
  }
});

test('runtime renderer rejects shadowing every shared contract function', (t) => {
  const directory = fixture(t);
  const contractFunctions = [
    'doccanvas_docker_health_status',
    'doccanvas_docker_image_healthcheck_test',
    'doccanvas_docker_container_healthcheck_test',
    'doccanvas_docker_runtime_state',
    'doccanvas_same_file',
    'doccanvas_verify_inherited_lock_fd',
  ];

  for (const [index, functionName] of contractFunctions.entries()) {
    const template = join(directory, `shadow-${index}.template.sh`);
    const output = join(directory, `shadow-${index}.sh`);
    writeFileSync(template, `#!/usr/bin/env bash
# @doccanvas-runtime-contract
${functionName}() { printf 'shadowed\\n'; }
`);
    const result = render(template, output);
    assert.notEqual(result.status, 0, `${functionName} shadowing must fail`);
    assert.match(result.stderr, /template redefines runtime contract function/);
    assert.equal(existsSync(output), false);
  }
});

test('runtime renderer rejects overriding every shared contract variable', (t) => {
  const directory = fixture(t);
  const contractVariables = [
    'DOCCANVAS_DOCKER_HEALTH_STATUS_TEMPLATE',
    'DOCCANVAS_DOCKER_IMAGE_HEALTHCHECK_TEMPLATE',
    'DOCCANVAS_DOCKER_RUNTIME_STATE_TEMPLATE',
  ];

  for (const [index, variableName] of contractVariables.entries()) {
    const template = join(directory, `variable-${index}.template.sh`);
    const output = join(directory, `variable-${index}.sh`);
    writeFileSync(template, `#!/usr/bin/env bash
# @doccanvas-runtime-contract
${variableName}='unsafe'
`);
    const result = render(template, output);
    assert.notEqual(result.status, 0, `${variableName} override must fail`);
    assert.match(result.stderr, /template references reserved runtime contract variable/);
    assert.equal(existsSync(output), false);
  }
});

test('runtime renderer resolves checksum support before create-only publication', () => {
  const source = readFileSync(renderer, 'utf8');
  const checksumCheck = source.indexOf('command -v sha256sum');
  const publish = source.indexOf('ln "$STAGING" "$OUTPUT"');

  assert.notEqual(checksumCheck, -1);
  assert.notEqual(publish, -1);
  assert.ok(checksumCheck < publish, 'checksum support must be resolved before publication');
});

test('production runbook binds restart harness rendering and resource acceptance', () => {
  const source = readFileSync(runbook, 'utf8');

  assert.match(source, /render-runtime-script\.sh/);
  assert.match(source, /# @doccanvas-runtime-contract/);
  assert.match(source, /Docker 26\.1\.3/);
  assert.match(source, /<container-id>\|running\|none\|0\|false/);
  assert.match(source, /90 秒/);
  assert.match(source, /45/);
  assert.match(source, /3 秒/);
  assert.match(source, /previous release.*compose\.yaml.*release\.env/is);
  assert.match(source, /restart-bundle\.sha256/);
});
