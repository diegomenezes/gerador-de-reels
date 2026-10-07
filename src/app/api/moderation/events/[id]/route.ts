import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await prisma.moderationEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
