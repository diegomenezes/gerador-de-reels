import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { latestStoredGroupMessage } from "@/lib/moderation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const remoteJid = request.nextUrl.searchParams.get("remoteJid");
  if (!remoteJid) {
    return NextResponse.json({ error: "Informe o grupo." }, { status: 400 });
  }

  const group = await prisma.group.findUnique({ where: { remoteJid } });
  if (!group) {
    return NextResponse.json({ error: "Grupo não cadastrado." }, { status: 404 });
  }

  const latest = await latestStoredGroupMessage({
    name: group.name,
    remoteJid: group.remoteJid,
    active: group.active,
    groupId: group.id,
  });
  return NextResponse.json({ latest });
}
