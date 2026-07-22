import { NextRequest, NextResponse } from 'next/server';
import { buildSolutionScaffold } from '@/lib/solutions/blueprint-scaffold';
import { loadKnowledgeLibrary } from '@/lib/server/knowledge-library';
import { knowledgeReviewStorePath } from '@/lib/server/knowledge-review-store';
import { parseJsonBody } from '@/lib/server/parse-json-body';

export async function POST(req: NextRequest) {
  const body = await parseJsonBody(req);
  if (!body.ok) return NextResponse.json({ error: 'Invalid Solution scaffold payload.' }, { status: 400 });
  try {
    const library = loadKnowledgeLibrary(undefined, knowledgeReviewStorePath());
    const result = buildSolutionScaffold(
      body.value as Parameters<typeof buildSolutionScaffold>[0],
      library,
      new Date().toISOString(),
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Solution scaffold failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
