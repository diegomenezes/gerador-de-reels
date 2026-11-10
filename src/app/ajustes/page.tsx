import type { ReactNode } from "react";
import { GroupsManager } from "@/components/GroupsManager";
import { PageHeader } from "@/components/PageHeader";
import { RunSourceButton } from "@/components/RunSourceButton";
import {
  AutoToggle,
  EvolutionTest,
  TextFileEditor,
  TrendsSettings,
} from "@/components/SettingsCards";
import { apifyConfigured } from "@/lib/apify";
import { prisma } from "@/lib/db";
import { readHookModels } from "@/lib/hook-models";
import { lastJob } from "@/lib/ideas";
import { readToneOfVoice } from "@/lib/tone";
import { costPerVideo, getSettings, parsePlatforms, parseTerms } from "@/lib/viral";
import { youtubeApiConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  daily: "Automático (6h)",
  group: "Grupo",
  viral: "Tendências",
  youtube: "YouTube",
};

const SECTIONS = [
  { id: "fontes", label: "Fontes" },
  { id: "escrita", label: "Escrita" },
  { id: "sistema", label: "Sistema" },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-24 space-y-4 p-5 md:p-6">
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-[var(--ink-soft)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
      {children}
    </h3>
  );
}

export default async function AjustesPage() {
  const [settings, groups, tone, hookModels, jobs, autoJob] = await Promise.all([
    getSettings(),
    prisma.group.findMany({ orderBy: { createdAt: "asc" } }),
    readToneOfVoice(),
    readHookModels(),
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    lastJob(["daily"]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" description="De onde vêm as ideias, como o texto é escrito e o estado do sistema." />

      <nav className="sticky top-0 z-30 -mx-4 flex gap-2 overflow-x-auto bg-[var(--bg)]/90 px-4 py-2 backdrop-blur">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="btn btn-secondary min-h-0 shrink-0 px-4 py-1.5 text-sm">
            {s.label}
          </a>
        ))}
      </nav>

      <GroupTitle>
        <span id="fontes" className="scroll-mt-24">Fontes de ideias</span>
      </GroupTitle>

      <Section
        id="grupo"
        title="Grupo de WhatsApp"
        description="Lê as mensagens das últimas 24 horas e separa dúvidas e polêmicas."
      >
        <AutoToggle
          field="groupSource"
          initial={settings.groupSource}
          label="Ler o grupo todo dia às 6h"
          detail="Desligado, o grupo só é lido pelo botão na tela Grupo."
        />
        <div>
          <p className="mb-2 text-sm font-semibold">Grupos monitorados</p>
          <GroupsManager initialGroups={groups} />
        </div>
      </Section>

      <Section
        id="tendencias"
        title="Tendências (TikTok, Reels e Shorts)"
        description="Busca vídeos curtos de impressão 3D que estão indo bem e transforma os melhores em ideias."
      >
        <AutoToggle
          field="viralSource"
          initial={settings.viralSource}
          label="Buscar tendências todo dia às 6h"
          detail="Desligado, só busca pelo botão na tela Tendências."
        />
        <TrendsSettings
          initial={{
            viralPerSearch: settings.viralPerSearch,
            viralTerms: parseTerms(settings.viralTerms),
            viralPlatforms: parsePlatforms(settings.viralPlatforms).filter(
              (p): p is "tiktok" | "instagram" | "youtube" => p !== "youtube-long",
            ),
            ignoreAuthors: settings.ignoreAuthors,
          }}
          costs={{
            tiktok: costPerVideo("tiktok"),
            instagram: costPerVideo("instagram"),
            youtube: costPerVideo("youtube"),
          }}
          apifyReady={apifyConfigured()}
          youtubeApiReady={youtubeApiConfigured()}
        />
      </Section>

      <Section
        id="youtube"
        title="YouTube (vídeos longos)"
        description="Nunca roda sozinho: só pelo botão na tela YouTube. Usa os termos de Tendências."
      >
        <p className="text-sm">
          Busca pela{" "}
          <strong>{youtubeApiConfigured() ? "API oficial do YouTube (grátis)" : "Apify (pago por vídeo)"}</strong>.
        </p>
      </Section>

      <GroupTitle>
        <span id="escrita" className="scroll-mt-24">Escrita</span>
      </GroupTitle>

      <Section
        id="tom"
        title="Tom de voz"
        description="Como você fala. Entra em todo roteiro, legenda e estrutura de vídeo."
      >
        <TextFileEditor endpoint="/api/tone" initial={tone} />
      </Section>

      <Section
        id="ganchos"
        title="Modelos de ganchos"
        description="Estruturas de gancho que a IA usa como base para sugerir a primeira frase."
      >
        <TextFileEditor
          endpoint="/api/hook-models"
          initial={hookModels}
          placeholder="Cole seus modelos de ganchos aqui..."
        />
      </Section>

      <GroupTitle>
        <span id="sistema" className="scroll-mt-24">Sistema</span>
      </GroupTitle>

      <Section id="execucoes" title="Execuções recentes">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--ink-soft)]">
            O job automático roda às 6h com as fontes ligadas acima.
          </p>
          <RunSourceButton mode="daily" label="Rodar o automático agora" lastJob={autoJob} />
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Nada rodou ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <strong>{MODE_LABEL[job.mode] ?? job.mode}</strong>{" "}
                  <span className="text-[var(--ink-soft)]">
                    {job.startedAt.toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="text-[var(--ink-soft)]">
                  {job.running ? (
                    job.stage
                  ) : job.success ? (
                    <>
                      {job.topicsCreated} ideia(s)
                      {job.videosIn ? ` · ${job.videosIn} vídeos` : ""}
                      {job.messagesIn ? ` · ${job.messagesIn} mensagens` : ""}
                    </>
                  ) : (
                    <span className="text-[var(--warn)]">falhou</span>
                  )}
                </span>
                {job.error && (
                  <span className="w-full text-xs text-[var(--warn)]">{job.error.slice(0, 300)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="whatsapp" title="Conexão com o WhatsApp" description="A Evolution API que recebe as mensagens do grupo.">
        <EvolutionTest />
      </Section>
    </div>
  );
}
