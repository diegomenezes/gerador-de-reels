import { NextResponse } from "next/server";
import { createScriptForTopic } from "@/lib/pipeline";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userNotes?: string;
  };

  try {
    const script = await createScriptForTopic(id, {
      userNotes:
        typeof body.userNotes === "string" ? body.userNotes.trim() : undefined,
    });
    return NextResponse.json(script, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
