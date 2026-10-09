import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureModerationDefaults, toGroupJid } from "@/lib/moderation";

const Schema = z.object({
  enabled: z.boolean(),
  deleteMode: z.boolean(),
  notifyNumber: z.string().trim().max(80),
  announceDelete: z.boolean(),
  announceText: z.string().trim().max(1000),
});

export async function PATCH(request: Request) {
  await ensureModerationDefaults();
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const notifyGroup = toGroupJid(parsed.data.notifyNumber);
  if (notifyGroup === null) {
    return NextResponse.json(
      { error: "Informe o ID do grupo, como 120363405756239332@g.us" },
      { status: 400 },
    );
  }
  if (parsed.data.announceDelete && !parsed.data.announceText) {
    return NextResponse.json(
      { error: "Escreva a mensagem que o bot envia depois de apagar." },
      { status: 400 },
    );
  }

  const settings = await prisma.moderationSettings.update({
    where: { id: "default" },
    data: { ...parsed.data, notifyNumber: notifyGroup },
  });
  return NextResponse.json(settings);
}
