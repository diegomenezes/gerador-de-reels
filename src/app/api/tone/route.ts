import { NextResponse } from "next/server";
import { readToneOfVoice, writeToneOfVoice } from "@/lib/tone";

export async function GET() {
  const content = await readToneOfVoice();
  return NextResponse.json({ content });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    content?: string;
  } | null;

  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "Conteúdo inválido" }, { status: 400 });
  }

  await writeToneOfVoice(body.content);
  return NextResponse.json({ ok: true });
}
