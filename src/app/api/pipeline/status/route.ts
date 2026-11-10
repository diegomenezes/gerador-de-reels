import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  const job = jobId
    ? await prisma.jobRun.findUnique({ where: { id: jobId } })
    : await prisma.jobRun.findFirst({ orderBy: { startedAt: "desc" } });

  if (!job) {
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      startedAt: job.startedAt.toISOString(),
      finishedAt: job.finishedAt?.toISOString() ?? null,
      success: job.success,
      running: job.running,
      stage: job.stage,
      messagesIn: job.messagesIn,
      messagesKept: job.messagesKept,
      topicsCreated: job.topicsCreated,
      videosIn: job.videosIn,
      error: job.error,
    },
  });
}
