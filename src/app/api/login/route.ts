import { NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;

  if (!body?.password || !verifyPassword(body.password)) {
    return NextResponse.json({ error: "Senha inválida" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
