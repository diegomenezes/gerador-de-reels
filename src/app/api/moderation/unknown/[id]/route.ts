import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const Schema = z.object({
  decision: z.enum(["allow", "block"]),
});

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escolha liberar ou bloquear" }, { status: 400 });
  }

  const link = await prisma.unknownLink.findUnique({ where: { id } });
  if (!link) {
    return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });
  }

  const domain = link.domain;
  if (parsed.data.decision === "allow") {
    await prisma.blockedDomain.deleteMany({ where: { domain } });
    await prisma.allowedDomain.upsert({
      where: { domain },
      create: { domain },
      update: {},
    });
  } else {
    await prisma.allowedDomain.deleteMany({ where: { domain } });
    await prisma.blockedDomain.upsert({
      where: { domain },
      create: { domain },
      update: {},
    });
  }
  await prisma.unknownLink.delete({ where: { id } });
  return NextResponse.json({ ok: true, domain });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await prisma.unknownLink.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
