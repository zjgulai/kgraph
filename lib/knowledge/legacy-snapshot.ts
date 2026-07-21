export const LEGACY_STRUCTURED_SNAPSHOT_HEADING = '## Legacy structured snapshot';

export interface KnowledgeBodyParts {
  narrative: string;
  legacySnapshot: string | null;
}

export function splitKnowledgeBody(body: string): KnowledgeBodyParts {
  const snapshotIndex = body.indexOf(LEGACY_STRUCTURED_SNAPSHOT_HEADING);
  if (snapshotIndex === -1) return { narrative: body, legacySnapshot: null };
  return {
    narrative: body.slice(0, snapshotIndex).trimEnd(),
    legacySnapshot: body.slice(snapshotIndex),
  };
}

export function mergeKnowledgeBody(narrative: string, legacySnapshot: string | null): string {
  if (!legacySnapshot) return narrative;
  return `${narrative.trimEnd()}\n\n${legacySnapshot}`;
}
