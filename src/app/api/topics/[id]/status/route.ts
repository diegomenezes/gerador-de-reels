import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  status: z.enum(["new", "scripted", "recorded", "discarded"]),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  }

  const topic = await prisma.topic.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json(topic);
}
