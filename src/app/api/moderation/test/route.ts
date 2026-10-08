import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTextMessage } from "@/lib/evolution";
import { ensureModerationDefaults, toGroupJid } from "@/lib/moderation";

export async function POST() {
  await ensureModerationDefaults();
  const settings = await prisma.moderationSettings.findUniqueOrThrow({
    where: { id: "default" },
  });
  const groupJid = toGroupJid(settings.notifyNumber);
  if (!groupJid) {
    return NextResponse.json(
      { error: "Salve o ID do grupo de aviso antes de disparar o teste." },
      { status: 400 },
    );
  }

  try {
    await sendTextMessage(
      groupJid,
      [
        "Teste de moderação",
        "",
        "Se esta mensagem chegou, o aviso neste grupo está funcionando.",
      ].join("\n"),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
