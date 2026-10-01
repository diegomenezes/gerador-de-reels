import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDailyPipeline } from "@/lib/pipeline";

export const maxDuration = 300;

export async function POST() {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.jobRun.updateMany({
    where: { running: true, startedAt: { lt: staleBefore } },
    data: {
      running: false,
      success: false,
      stage: "Interrompido",
      finishedAt: new Date(),
      error: "Job excedeu 10 minutos e foi marcado como interrompido.",
    },
  });

  const running = await prisma.jobRun.findFirst({
    where: { running: true },
    orderBy: { startedAt: "desc" },
  });

  if (running) {
    return NextResponse.json({
      jobId: running.id,
      started: false,
      alreadyRunning: true,
      stage: running.stage,
    });
  }

  const job = await prisma.jobRun.create({
    data: { running: true, stage: "Na fila..." },
  });

  // Roda em background para o front poder acompanhar o progresso
  void runDailyPipeline(job.id);

  return NextResponse.json({
    jobId: job.id,
    started: true,
    alreadyRunning: false,
    stage: job.stage,
  });
}
