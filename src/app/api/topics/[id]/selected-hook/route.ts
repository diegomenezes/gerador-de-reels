import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  selectedHook: z.union([z.string().min(1).max(200), z.null()]),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Gancho inválido" }, { status: 400 });
  }

  const script = await prisma.script.findFirst({
    where: { topicId: id },
    orderBy: { createdAt: "desc" },
  });

  if (!script) {
    return NextResponse.json({ error: "Roteiro não encontrado" }, { status: 404 });
  }

  const updated = await prisma.script.update({
    where: { id: script.id },
    data: { selectedHook: parsed.data.selectedHook },
  });

  return NextResponse.json({ selectedHook: updated.selectedHook });
}
