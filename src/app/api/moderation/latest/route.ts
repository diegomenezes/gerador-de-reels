import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchLatestGroupMessage } from "@/lib/evolution";

export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const latestMessages = await Promise.all(
    groups.map((group) =>
      fetchLatestGroupMessage(
        {
          name: group.name,
          remoteJid: group.remoteJid,
          active: group.active,
        },
        20000,
      ),
    ),
  );
  return NextResponse.json({ latestMessages });
}
