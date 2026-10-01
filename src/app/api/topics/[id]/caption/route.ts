import { NextResponse } from "next/server";
import { generateCaptionForTopic } from "@/lib/pipeline";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const script = await generateCaptionForTopic(id);
    return NextResponse.json({ caption: script.caption });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
