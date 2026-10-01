import { NextResponse } from "next/server";
import { regenerateHooksForTopic } from "@/lib/pipeline";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const script = await regenerateHooksForTopic(id);
    return NextResponse.json({
      hooks: JSON.parse(script.hooks || "[]") as string[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
