import { NextResponse } from 'next/server';
import { KnowledgeReviewError, listKnowledgeReviewQueue } from '@/lib/server/knowledge-review-store';

export async function GET() {
  try {
    return NextResponse.json({ queue: listKnowledgeReviewQueue() }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof KnowledgeReviewError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Knowledge review queue unavailable.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
