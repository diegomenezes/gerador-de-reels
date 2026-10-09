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
  const announcement = settings.announceText.trim();
  if (!announcement) {
    return NextResponse.json(
      { error: "Escreva a mensagem que o bot envia depois de apagar." },
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

  let result: "gone" | "unconfirmed";
  try {
    result = await deleteOwnGroupMessage({
      id: sent.id,
      remoteJid: sent.remoteJid || groupJid,
      participant: sent.participant,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  try {
    await sendTextMessage(groupJid, announcement, { delay: 1500 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detail }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    confirmed: result === "gone",
  });
}
