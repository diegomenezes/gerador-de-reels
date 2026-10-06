import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { linkKey } from "@/lib/moderation";

const Schema = z.object({
  url: z.string().trim().url().max(500),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Link inválido" }, { status: 400 });
  }

  const key = linkKey(parsed.data.url);
  if (!key?.startsWith("chat.whatsapp.com/")) {
    return NextResponse.json(
      { error: "A whitelist é só para links chat.whatsapp.com" },
      { status: 400 },
    );
  }

  const url = `https://${key}`;
  const saved = await prisma.whitelistLink.upsert({
    where: { url },
    create: { url },
    update: {},
  });
  return NextResponse.json(saved, { status: 201 });
}
