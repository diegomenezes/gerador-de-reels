import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/viral";

const term = z.string().trim().min(2).max(60);
// cada cartão de Ajustes salva só os campos dele
const Body = z
  .object({
    groupSource: z.boolean(),
    viralSource: z.boolean(),
    viralPerSearch: z.number().int().min(1).max(50),
    viralPlatforms: z.array(z.enum(["tiktok", "instagram", "youtube"])),
    ignoreAuthors: z.string().max(500),
    viralTerms: z.object({
      pt: z.array(term).max(10),
      en: z.array(term).max(10),
      es: z.array(term).max(10),
    }),
  })
  .partial();

export async function PUT(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Confira os campos: termos com 2 a 60 letras, até 10 por idioma, e 1 a 50 vídeos por busca.",
      },
      { status: 400 },
    );
  }
  await getSettings();
  const { viralTerms, viralPlatforms, ...rest } = parsed.data;
  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      ...rest,
      ...(viralTerms ? { viralTerms: JSON.stringify(viralTerms) } : {}),
      ...(viralPlatforms ? { viralPlatforms: viralPlatforms.join(",") } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
