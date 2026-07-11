export async function parseJsonBody(request: { json(): Promise<unknown> }) {
  try {
    return { ok: true as const, value: await request.json() };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { ok: false as const };
  }
}
