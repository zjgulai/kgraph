import { existsSync, lstatSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { getConfiguredPilotAuthorizationRequest } from '../lib/server/knowledge-enrichment-authorization-request';

function outputArgument(args: string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
    throw new Error('Usage: enrichment-pilot-authorization-request [--output /absolute/create-only.json]');
  }
  if (!isAbsolute(args[1])) throw new Error('Output path must be absolute.');
  return resolve(args[1]);
}

function writeCreateOnly(path: string, content: string): void {
  const parent = dirname(path);
  if (!existsSync(parent)) throw new Error('Output parent directory does not exist.');
  const stat = lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output parent must be a real directory.');
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o640, flag: 'wx', flush: true });
}

try {
  const output = outputArgument(process.argv.slice(2));
  const request = getConfiguredPilotAuthorizationRequest();
  const serialized = `${JSON.stringify(request, null, 2)}\n`;
  if (output) {
    writeCreateOnly(output, serialized);
    process.stdout.write(`${JSON.stringify({ output, requestHash: request.requestHash, state: request.state })}\n`);
  } else {
    process.stdout.write(serialized);
  }
  if (request.state === 'not_configured' || request.state === 'blocked') process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Authorization request generation failed.'}\n`);
  process.exitCode = 1;
}
