import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  remoteJid: z.string().min(5).max(120),
  active: z.boolean().optional(),
});

export async function GET() {
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(groups);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const remoteJid = parsed.data.remoteJid.trim();
  const group = await prisma.group.create({
    data: {
      name: parsed.data.name.trim(),
      remoteJid,
      active: parsed.data.active ?? true,
    },
  });

  return NextResponse.json(group, { status: 201 });
}
