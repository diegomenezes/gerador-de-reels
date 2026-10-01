import { NextResponse } from "next/server";
import { createScriptsForTopTopics } from "@/lib/pipeline";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.min(Math.max(body.limit ?? 10, 1), 20);

  try {
    const scripts = await createScriptsForTopTopics(limit);
    return NextResponse.json({ count: scripts.length, scripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
