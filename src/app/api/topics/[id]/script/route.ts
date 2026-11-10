import { NextResponse } from "next/server";
import { scriptJobStatus, startScriptJob } from "@/lib/script-jobs";

type Params = { params: Promise<{ id: string }> };

/** Dispara a geração do roteiro em segundo plano e responde na hora. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userNotes?: string;
    withTranscript?: boolean;
  };

  const job = startScriptJob(id, {
    userNotes: typeof body.userNotes === "string" ? body.userNotes.trim() : undefined,
    withTranscript: body.withTranscript === true,
  });
  return NextResponse.json({ state: job.state, startedAt: job.startedAt }, { status: 202 });
}

/** Andamento da geração: running, done, error (ou idle se nada rodou). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const job = scriptJobStatus(id);
  return NextResponse.json(
    job ? { state: job.state, startedAt: job.startedAt, error: job.error ?? null } : { state: "idle" },
  );
}
