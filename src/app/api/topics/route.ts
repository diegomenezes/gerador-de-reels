import { format } from "date-fns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const Schema = z.object({
  title: z.string().trim().min(3, "Título muito curto").max(200),
  summary: z.string().trim().max(500).optional(),
  userNotes: z.string().trim().max(2000).optional(),
  kind: z.enum(["question", "polemic"]).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "Dados inválidos";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { title, summary, userNotes, kind } = parsed.data;
  const dateBucket = format(new Date(), "yyyy-MM-dd");

  const topic = await prisma.topic.create({
    data: {
      title,
      summary: summary || title,
      frequency: 1,
      score: 100,
      dateBucket,
      status: "new",
      kind: kind || "question",
      userNotes: userNotes || null,
      examples: {
        create: [{ text: title }],
      },
    },
  });

  return NextResponse.json(topic, { status: 201 });
}
