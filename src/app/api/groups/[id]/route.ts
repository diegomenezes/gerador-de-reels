import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  remoteJid: z.string().min(5).max(120).optional(),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const group = await prisma.group.update({
    where: { id },
    data: {
      ...parsed.data,
      name: parsed.data.name?.trim(),
      remoteJid: parsed.data.remoteJid?.trim(),
    },
  });

  return NextResponse.json(group);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await prisma.group.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
