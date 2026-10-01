import { NextResponse } from "next/server";
import { readHookModels, writeHookModels } from "@/lib/hook-models";

export async function GET() {
  const content = await readHookModels();
  return NextResponse.json({ content });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    content?: string;
  } | null;

  if (typeof body?.content !== "string") {
    return NextResponse.json({ error: "Conteúdo inválido" }, { status: 400 });
  }

  await writeHookModels(body.content);
  return NextResponse.json({ ok: true });
}
