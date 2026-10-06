import { NextResponse } from "next/server";
import { scanRecentMessages } from "@/lib/moderation";

export async function POST() {
  try {
    const result = await scanRecentMessages(30);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
