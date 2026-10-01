import { ConfigPanel } from "@/components/ConfigPanel";
import { prisma } from "@/lib/db";
import { readHookModels } from "@/lib/hook-models";
import { readToneOfVoice } from "@/lib/tone";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const [lastJob, tone, hookModels] = await Promise.all([
    prisma.jobRun.findFirst({ orderBy: { startedAt: "desc" } }),
    readToneOfVoice(),
    readHookModels(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Config</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          Rode o job, edite o tom de voz e os modelos de ganchos.
        </p>
      </section>
      <ConfigPanel
        lastJob={
          lastJob
            ? {
                id: lastJob.id,
                startedAt: lastJob.startedAt.toISOString(),
                finishedAt: lastJob.finishedAt?.toISOString() ?? null,
                success: lastJob.success,
                running: lastJob.running,
                stage: lastJob.stage,
                messagesIn: lastJob.messagesIn,
                messagesKept: lastJob.messagesKept,
                topicsCreated: lastJob.topicsCreated,
                error: lastJob.error,
              }
            : null
        }
        initialTone={tone}
        initialHookModels={hookModels}
      />
    </div>
  );
}
