import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  statSync,
  type BigIntStats,
} from 'node:fs';
import { extractMarkdownSections } from '@/lib/markdown/sections';

export interface DocumentReadiness {
  accessible: boolean;
  parseable: boolean;
}

interface CachedReadiness {
  revision: string;
  parseable: boolean;
}

export interface DocumentReadinessCache {
  check(filePath: string): DocumentReadiness;
  retain(filePaths: Iterable<string>): void;
}

function revisionOf(stat: BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
}

function defaultParseable(markdown: string): boolean {
  return extractMarkdownSections(markdown).length > 0;
}

export function createDocumentReadinessCache(
  isParseable: (markdown: string) => boolean = defaultParseable,
): DocumentReadinessCache {
  const cachedByPath = new Map<string, CachedReadiness>();

  return {
    check(filePath) {
      let observedAccessible = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let descriptor: number | undefined;
        try {
          descriptor = openSync(filePath, constants.O_RDONLY);
          const before = fstatSync(descriptor, { bigint: true });
          if (!before.isFile()) throw new Error('not a regular file');
          observedAccessible = true;
          const revision = revisionOf(before);
          const cached = cachedByPath.get(filePath);
          if (cached?.revision === revision) {
            const current = statSync(filePath, { bigint: true });
            if (current.isFile() && revisionOf(current) === revision) {
              return { accessible: true, parseable: cached.parseable };
            }
            cachedByPath.delete(filePath);
            continue;
          }

          const markdown = readFileSync(descriptor, 'utf8');
          let parseable = false;
          try {
            parseable = isParseable(markdown);
          } catch {
            parseable = false;
          }

          const after = fstatSync(descriptor, { bigint: true });
          const current = statSync(filePath, { bigint: true });
          if (
            current.isFile()
            && revisionOf(after) === revision
            && revisionOf(current) === revision
          ) {
            cachedByPath.set(filePath, { revision, parseable });
            return { accessible: true, parseable };
          }
          cachedByPath.delete(filePath);
        } catch {
          cachedByPath.delete(filePath);
          return { accessible: false, parseable: false };
        } finally {
          if (descriptor !== undefined) closeSync(descriptor);
        }
      }
      return { accessible: observedAccessible, parseable: false };
    },

    retain(filePaths) {
      const retained = new Set(filePaths);
      for (const filePath of cachedByPath.keys()) {
        if (!retained.has(filePath)) cachedByPath.delete(filePath);
      }
    },
  };
}
