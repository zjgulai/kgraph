import {
  createEnrichmentUnlockPack,
  type UnlockPackProviderId,
} from '../lib/server/knowledge-enrichment-unlock-pack';

const USAGE = 'Usage: enrichment-pilot-unlock-pack --output-dir /absolute/create-only-dir --api-key-file /absolute/secret-file [--provider openai|deepseek|kimi]';

function argumentsFrom(args: string[]): { outputDir: string; apiKeyFile: string; providerId?: UnlockPackProviderId } {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !value || !['--output-dir', '--api-key-file', '--provider'].includes(flag) || values.has(flag)) {
      throw new Error(USAGE);
    }
    values.set(flag, value);
  }
  const outputDir = values.get('--output-dir');
  const apiKeyFile = values.get('--api-key-file');
  const provider = values.get('--provider');
  if (![4, 6].includes(args.length) || !outputDir || !apiKeyFile || (provider && !['openai', 'deepseek', 'kimi'].includes(provider))) {
    throw new Error(USAGE);
  }
  return { outputDir, apiKeyFile, ...(provider ? { providerId: provider as UnlockPackProviderId } : {}) };
}

try {
  const result = createEnrichmentUnlockPack(argumentsFrom(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'awaiting_secret_install') process.exitCode = 2;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unlock pack generation failed.'}\n`);
  process.exitCode = 1;
}
