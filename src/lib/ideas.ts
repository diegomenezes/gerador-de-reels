import type { IdeaCard } from "@/components/IdeasBoard";
import type { JobSummary } from "@/components/RunSourceButton";
import { prisma } from "./db";

type Kind = IdeaCard["kind"];

export async function loadIdeas(kinds: Kind[]): Promise<IdeaCard[]> {
  const topics = await prisma.topic.findMany({
    where: { status: { not: "discarded" }, kind: { in: kinds } },
    include: { examples: true, scripts: { select: { id: true }, take: 1 } },
    orderBy: [{ dateBucket: "desc" }, { score: "desc" }, { frequency: "desc" }],
  });
  return topics.map((t) => ({
    id: t.id,
    title: t.title,
    summary: t.summary,
    frequency: t.frequency,
    score: t.score,
    dateBucket: t.dateBucket,
    status: t.status,
    kind: t.kind,
    hasScript: t.scripts.length > 0,
    userNotes: t.userNotes || "",
    examples: t.examples.map((e) => ({ id: e.id, text: e.text, url: e.url, transcript: e.transcript })),
  }));
}

/** Última execução de uma fonte (o job automático conta para grupo e tendências). */
export async function lastJob(modes: string[]): Promise<JobSummary | null> {
  const job = await prisma.jobRun.findFirst({
    where: { mode: { in: modes } },
    orderBy: { startedAt: "desc" },
  });
  if (!job) return null;
  return {
    id: job.id,
    mode: job.mode,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    running: job.running,
    success: job.success,
    stage: job.stage,
    topicsCreated: job.topicsCreated,
    messagesIn: job.messagesIn,
    videosIn: job.videosIn,
    error: job.error,
  };
}
