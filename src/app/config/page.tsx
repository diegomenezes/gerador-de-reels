import { ConfigPanel } from "@/components/ConfigPanel";
import { SourcesPanel } from "@/components/SourcesPanel";
import { apifyConfigured } from "@/lib/apify";
import { prisma } from "@/lib/db";
import { readHookModels } from "@/lib/hook-models";
import { readToneOfVoice } from "@/lib/tone";
import { costPerVideo, getSettings, parsePlatforms, parseTerms } from "@/lib/viral";
import { youtubeApiConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const [lastJob, tone, hookModels, settings] = await Promise.all([
    prisma.jobRun.findFirst({ orderBy: { startedAt: "desc" } }),
    readToneOfVoice(),
    readHookModels(),
    getSettings(),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Config</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          Escolha as fontes de ideias, rode o job, edite o tom de voz e os modelos de ganchos.
        </p>
      </section>
      <SourcesPanel
        initial={{
          groupSource: settings.groupSource,
          viralSource: settings.viralSource,
          viralPerSearch: settings.viralPerSearch,
          viralTerms: parseTerms(settings.viralTerms),
          viralPlatforms: parsePlatforms(settings.viralPlatforms).filter(
            (p): p is "tiktok" | "instagram" | "youtube" => p !== "youtube-long",
          ),
          ignoreAuthors: settings.ignoreAuthors,
        }}
        apifyReady={apifyConfigured()}
        costs={{
          tiktok: costPerVideo("tiktok"),
          instagram: costPerVideo("instagram"),
          youtube: costPerVideo("youtube"),
        }}
        youtubeApiReady={youtubeApiConfigured()}
      />
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
                videosIn: lastJob.videosIn,
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
