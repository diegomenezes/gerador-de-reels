import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteOwnGroupMessage, sendTextMessage } from "@/lib/evolution";
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

  let sent;
  try {
    sent = await sendTextMessage(
      groupJid,
      [
        "Teste de apagar",
        "",
        "Esta mensagem deve sumir do grupo em seguida.",
      ].join("\n"),
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  await new Promise((resolve) => setTimeout(resolve, 4000));

  try {
    const result = await deleteOwnGroupMessage({
      id: sent.id,
      remoteJid: sent.remoteJid || groupJid,
      participant: sent.participant,
    });
    return NextResponse.json({
      ok: true,
      confirmed: result === "gone",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }
}
