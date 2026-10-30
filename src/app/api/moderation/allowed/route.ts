import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hostMatchesDomain } from "@/lib/moderation";

const Schema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domínio inválido"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Domínio inválido" },
      { status: 400 },
    );
  }

  const domain = parsed.data.domain.replace(/^www\./, "");
  const blocked = await prisma.blockedDomain.findMany();
  const conflict = blocked.find((item) => hostMatchesDomain(domain, item.domain));
  if (conflict) {
    return NextResponse.json(
      {
        error: `${domain} está nos bloqueados (${conflict.domain}). Remova de lá antes de liberar.`,
      },
      { status: 409 },
    );
  }

  const saved = await prisma.allowedDomain.upsert({
    where: { domain },
    create: { domain },
    update: {},
  });
  await prisma.unknownLink.deleteMany({ where: { domain } });
  return NextResponse.json(saved, { status: 201 });
}
