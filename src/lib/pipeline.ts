import { format } from "date-fns";
import { prisma } from "./db";
import { compactMessages, sameReelTheme } from "./filter";
import { readHookModels } from "./hook-models";
import {
  clusterDoubts,
  clusterPolemics,
  generateHookSuggestions,
  generateInstagramCaption,
  generateReelScript,
  generateViralIdeas,
} from "./openai";
import { readToneOfVoice } from "./tone";
import { fetchTranscript } from "./transcript";
import {
  cleanText,
  collectVideos,
  formatCount,
  getSettings,
  parseAuthors,
  parsePlatforms,
  parseTerms,
  type Platform,
  pickVideosForIdeas,
  PLATFORM_LABEL,
} from "./viral";

export type PipelineResult = {
  jobId: string;
  success: boolean;
  messagesIn: number;
  messagesKept: number;
  topicsCreated: number;
  error?: string;
  stage?: string;
};

async function setStage(
  jobId: string,
  stage: string,
  extra?: {
    messagesIn?: number;
    messagesKept?: number;
    topicsCreated?: number;
  },
) {
  await prisma.jobRun.update({
    where: { id: jobId },
    data: { stage, ...extra },
  });
}

/** daily = job automático (fontes ligadas em Ajustes); os outros rodam uma fonte só, pelo botão. */
export type PipelineMode = "daily" | "group" | "viral" | "youtube";

async function coveredThemes() {
  return prisma.topic.findMany({
    where: {
      OR: [
        { scripts: { some: {} } },
        { status: { in: ["scripted", "recorded"] } },
      ],
    },
    select: { title: true, summary: true },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });
}

/** Dúvidas e polêmicas das mensagens do grupo nas últimas 24h. */
async function runGroupSource(jobId: string, dateBucket: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const groups = await prisma.group.findMany({ where: { active: true } });
  if (groups.length === 0) {
    throw new Error("Nenhum grupo ativo cadastrado");
  }

  const messagesIn = await prisma.message.count({
    where: { timestamp: { gte: since }, group: { active: true } },
  });
  await setStage(jobId, "Filtrando dúvidas do grupo...", { messagesIn });

  const recent = await prisma.message.findMany({
    where: { timestamp: { gte: since }, group: { active: true } },
    select: { text: true },
    orderBy: { timestamp: "desc" },
    take: 5000,
  });

  const compact = compactMessages(
    // emoji partido numa mensagem faz a OpenAI recusar o pedido inteiro
    recent.map((m) => cleanText(m.text)),
    120,
  );
  const messagesKept = compact.reduce((acc, m) => acc + m.count, 0);

  await setStage(jobId, "Agrupando dúvidas e polêmicas...", {
    messagesIn,
    messagesKept,
  });

  const covered = await coveredThemes();
  const [questions, polemics] = await Promise.all([
    clusterDoubts(compact, 15, covered),
    clusterPolemics(compact, 8, covered),
  ]);
  const clustered = [
    ...questions.map((topic) => ({ ...topic, kind: "question" as const })),
    ...polemics.map((topic) => ({ ...topic, kind: "polemic" as const })),
  ];

  await setStage(jobId, "Salvando dúvidas...", { messagesIn, messagesKept });
  const seen = await titleFilter(dateBucket, covered);

  let topicsCreated = 0;
  for (const topic of clustered) {
    if (!seen.accept(topic.title)) continue;
    await prisma.topic.create({
      data: {
        title: topic.title,
        summary: topic.summary,
        frequency: topic.frequency,
        score: topic.score,
        dateBucket,
        status: "new",
        kind: topic.kind,
        examples: {
          create: topic.examples.slice(0, 5).map((text) => ({ text })),
        },
      },
    });
    topicsCreated += 1;
  }
  return { messagesIn, messagesKept, topicsCreated };
}

/** Evita repetir ideia do mesmo dia ou tema que já tem roteiro. */
async function titleFilter(dateBucket: string, covered: { title: string }[]) {
  const existingToday = await prisma.topic.findMany({
    where: { dateBucket },
    select: { title: true },
  });
  const seenTitles = new Set(existingToday.map((t) => t.title.trim().toLowerCase()));
  const coveredTitles = covered.map((topic) => topic.title);
  return {
    accept(title: string) {
      const key = title.trim().toLowerCase();
      if (seenTitles.has(key)) return false;
      if (coveredTitles.some((t) => sameReelTheme(title, t))) return false;
      seenTitles.add(key);
      coveredTitles.push(title);
      return true;
    },
  };
}

/** Busca vídeos no Apify e transforma os mais fortes em ideias. */
async function runVideoSource(
  jobId: string,
  dateBucket: string,
  mode: "short" | "long",
  progress: { topicsCreated: number },
) {
  const settings = await getSettings();
  const terms = parseTerms(settings.viralTerms);
  const platforms: Platform[] =
    mode === "long" ? ["youtube-long"] : parsePlatforms(settings.viralPlatforms);

  await setStage(jobId, "Buscando vídeos...");
  const { found, errors } = await collectVideos(
    platforms,
    terms,
    settings.viralPerSearch,
    parseAuthors(settings.ignoreAuthors),
    (label) => setStage(jobId, `Buscando vídeos · ${label}`),
  );
  await prisma.jobRun.update({ where: { id: jobId }, data: { videosIn: found } });
  if (errors.length > 0) console.error("[virais]", errors.join(" | "));

  await setStage(jobId, "Gerando ideias a partir dos vídeos...");
  const videos = await pickVideosForIdeas(platforms, mode === "long" ? 30 : 20, 7);
  if (videos.length === 0) return { found, topicsCreated: 0, errors };

  const covered = await coveredThemes();
  const ideas = await generateViralIdeas(
    videos.map((v) => ({
      platform: PLATFORM_LABEL[v.platform] ?? v.platform,
      language: v.language,
      views: v.views,
      likes: v.likes,
      caption: v.caption,
    })),
    // poucas referências não rendem muitas ideias boas
    Math.min(mode === "long" ? 8 : 10, Math.max(3, videos.length)),
    covered,
    mode,
  );

  const seen = await titleFilter(dateBucket, covered);
  let topicsCreated = 0;
  const used = new Set<string>();
  for (const idea of ideas) {
    const sources = idea.sources.map((n) => videos[n - 1]).filter(Boolean);
    // duas ideias puxadas do mesmo vídeo principal são a mesma ideia
    if (sources.length === 0 || used.has(sources[0].id)) continue;
    if (!seen.accept(idea.title)) continue;
    sources.forEach((v) => used.add(v.id));
    await prisma.topic.create({
      data: {
        title: idea.title,
        summary: idea.summary,
        frequency: sources.length,
        score: idea.score,
        dateBucket,
        status: "new",
        kind: mode === "long" ? "youtube" : "viral",
        examples: {
          create: sources.slice(0, 5).map((v) => ({
            text: `${PLATFORM_LABEL[v.platform] ?? v.platform} · ${formatCount(v.views)} views · ${cleanText(v.caption.replace(/\s+/g, " "), 160)}`,
            url: v.url,
          })),
        },
      },
    });
    topicsCreated += 1;
    progress.topicsCreated += 1;
    await setStage(jobId, "Gerando ideias a partir dos vídeos...", {
      topicsCreated: progress.topicsCreated,
    });
  }
  if (used.size > 0) {
    await prisma.viralVideo.updateMany({
      where: { id: { in: [...used] } },
      data: { usedAt: new Date() },
    });
  }
  return { found, topicsCreated, errors };
}

export async function runDailyPipeline(
  existingJobId?: string,
  mode: PipelineMode = "daily",
): Promise<PipelineResult> {
  const job = existingJobId
    ? await prisma.jobRun.update({
        where: { id: existingJobId },
        data: { running: true, stage: "Iniciando...", error: null, mode },
      })
    : await prisma.jobRun.create({
        data: { running: true, stage: "Iniciando...", mode },
      });

  const dateBucket = format(new Date(), "yyyy-MM-dd");
  const progress = { topicsCreated: 0 };
  let messagesIn = 0;
  let messagesKept = 0;
  const errors: string[] = [];
  let anySource = false;
  let anySuccess = false;

  try {
    const settings = await getSettings();

    if (mode === "youtube") {
      anySource = true;
      const result = await runVideoSource(job.id, dateBucket, "long", progress);
      anySuccess = true;
      if (result.errors.length) errors.push(...result.errors.slice(0, 3));
    } else {
      const runGroup = mode === "group" || (mode === "daily" && settings.groupSource);
      const runViral = mode === "viral" || (mode === "daily" && settings.viralSource);
      if (runGroup) {
        anySource = true;
        try {
          const result = await runGroupSource(job.id, dateBucket);
          messagesIn = result.messagesIn;
          messagesKept = result.messagesKept;
          progress.topicsCreated += result.topicsCreated;
          anySuccess = true;
        } catch (err) {
          errors.push(`Grupo: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (runViral) {
        anySource = true;
        try {
          const result = await runVideoSource(job.id, dateBucket, "short", progress);
          anySuccess = true;
          if (result.errors.length) errors.push(...result.errors.slice(0, 3));
        } catch (err) {
          errors.push(`Vídeos: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!anySource) throw new Error("Nenhuma fonte ligada no job automático (Ajustes → Fontes)");
    }

    if (!anySuccess) throw new Error(errors.join(" | "));

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt: new Date(),
        success: true,
        running: false,
        stage: "Concluído",
        messagesIn,
        messagesKept,
        topicsCreated: progress.topicsCreated,
        // fonte que falhou junto com outra que deu certo fica registrada como aviso
        error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
      },
    });

    return {
      jobId: job.id,
      success: true,
      messagesIn,
      messagesKept,
      topicsCreated: progress.topicsCreated,
      stage: "Concluído",
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt: new Date(),
        success: false,
        running: false,
        stage: "Erro",
        messagesIn,
        messagesKept,
        topicsCreated: progress.topicsCreated,
        error: error.slice(0, 1000),
      },
    });
    return {
      jobId: job.id,
      success: false,
      messagesIn,
      messagesKept,
      topicsCreated: progress.topicsCreated,
      error,
      stage: "Erro",
    };
  }
}

const CRON_ATTEMPTS = 3;
const CRON_RETRY_GAP_MS = 20 * 60 * 1000;

let scheduledCron: Promise<void> | null = null;

export function startDailyPipelineWithRetries(): {
  started: boolean;
  alreadyRunning: boolean;
  attempts: number;
  gapMinutes: number;
} {
  if (scheduledCron) {
    return {
      started: false,
      alreadyRunning: true,
      attempts: CRON_ATTEMPTS,
      gapMinutes: 20,
    };
  }

  scheduledCron = (async () => {
    try {
      for (let attempt = 1; attempt <= CRON_ATTEMPTS; attempt += 1) {
        const result = await runDailyPipeline();
        if (result.success) return;
        if (attempt < CRON_ATTEMPTS) {
          console.log(
            `[cron] tentativa ${attempt} falhou: ${result.error ?? "erro desconhecido"}. Nova tentativa em 20 minutos.`,
          );
          await new Promise((resolve) => setTimeout(resolve, CRON_RETRY_GAP_MS));
        }
      }
    } finally {
      scheduledCron = null;
    }
  })();

  return {
    started: true,
    alreadyRunning: false,
    attempts: CRON_ATTEMPTS,
    gapMinutes: 20,
  };
}

/**
 * Transcrição dos vídeos de referência (até 3), buscada uma vez e guardada.
 * Falha de um vídeo não impede o roteiro; se nenhum tiver fala, avisa.
 */
async function transcriptsFor(
  examples: { id: string; url: string | null; text: string; transcript: string | null }[],
): Promise<string[]> {
  const withUrl = examples.filter((e) => e.url).slice(0, 3);
  if (withUrl.length === 0) throw new Error("Esta ideia não tem vídeo de referência");
  const result: string[] = [];
  for (const example of withUrl) {
    // "" = já tentou e o vídeo não tem fala: não paga de novo
    let transcript = example.transcript;
    if (transcript === null) {
      let failed = false;
      transcript = await fetchTranscript(example.url!).catch((err) => {
        failed = true;
        console.error("[transcricao]", example.url, err instanceof Error ? err.message : err);
        return null;
      });
      // erro de rede/Apify não grava nada, para tentar de novo depois
      if (!failed) {
        await prisma.topicExample.update({
          where: { id: example.id },
          data: { transcript: transcript ?? "" },
        });
      }
    }
    if (transcript) result.push(`${example.text.split(" · ")[0]}: ${transcript}`);
  }
  if (result.length === 0) {
    throw new Error("Não consegui a fala de nenhum vídeo de referência (sem legenda ou áudio). Use o Gerar roteiro normal.");
  }
  return result;
}

export async function createScriptForTopic(
  topicId: string,
  options?: { userNotes?: string; withTranscript?: boolean },
) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { examples: true, scripts: { orderBy: { createdAt: "desc" } } },
  });

  if (!topic) {
    throw new Error("Dúvida não encontrada");
  }

  if (topic.status === "discarded") {
    throw new Error("Dúvida descartada");
  }

  const userNotes =
    options?.userNotes !== undefined
      ? options.userNotes
      : topic.userNotes || "";

  if (options?.userNotes !== undefined) {
    await prisma.topic.update({
      where: { id: topic.id },
      data: { userNotes: userNotes || null },
    });
  }

  const previous = topic.scripts[0];
  const keepHooks = Boolean(previous);
  const examples = topic.examples.map((e) => e.text);
  const transcripts = options?.withTranscript ? await transcriptsFor(topic.examples) : [];

  const [tone, hookModels] = await Promise.all([
    readToneOfVoice(),
    keepHooks ? Promise.resolve("") : readHookModels(),
  ]);

  const generated = await generateReelScript({
    title: topic.title,
    summary: topic.summary,
    examples,
    tone,
    userNotes,
    kind: topic.kind,
    transcripts,
  });

  const hooks = keepHooks
    ? previous.hooks
    : JSON.stringify(
        await generateHookSuggestions({
          title: topic.title,
          summary: topic.summary,
          examples,
          hookModels,
          polemic: topic.kind === "polemic",
          kind: topic.kind,
        }),
      );

  // Substitui roteiro anterior (regenerar não acumula cópias)
  await prisma.script.deleteMany({ where: { topicId: topic.id } });

  const script = await prisma.script.create({
    data: {
      topicId: topic.id,
      content: generated.content,
      hooks,
      selectedHook: keepHooks ? previous.selectedHook : null,
      caption: null,
      model: generated.model,
    },
  });

  await prisma.topic.update({
    where: { id: topic.id },
    data: { status: "scripted" },
  });

  return script;
}

export async function regenerateHooksForTopic(topicId: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      examples: true,
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!topic) throw new Error("Dúvida não encontrada");
  if (topic.status === "discarded") throw new Error("Dúvida descartada");
  if (topic.scripts.length === 0) {
    throw new Error("Gere o roteiro antes de regenerar os ganchos");
  }

  const hookModels = await readHookModels();
  const hooks = await generateHookSuggestions({
    title: topic.title,
    summary: topic.summary,
    examples: topic.examples.map((e) => e.text),
    hookModels,
    polemic: topic.kind === "polemic",
    kind: topic.kind,
  });

  return prisma.script.update({
    where: { id: topic.scripts[0].id },
    data: { hooks: JSON.stringify(hooks) },
  });
}

export async function generateCaptionForTopic(topicId: string) {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!topic) throw new Error("Dúvida não encontrada");
  if (topic.status === "discarded") throw new Error("Dúvida descartada");
  if (topic.scripts.length === 0) {
    throw new Error("Gere o roteiro antes da legenda");
  }

  const script = topic.scripts[0];
  let hooks: string[] = [];
  try {
    hooks = JSON.parse(script.hooks || "[]") as string[];
    if (!Array.isArray(hooks)) hooks = [];
  } catch {
    hooks = [];
  }

  const tone = await readToneOfVoice();
  const caption = await generateInstagramCaption({
    title: topic.title,
    summary: topic.summary,
    scriptContent: script.content,
    tone,
    hooks,
    kind: topic.kind,
  });

  return prisma.script.update({
    where: { id: script.id },
    data: { caption },
  });
}

export async function createScriptsForTopTopics(limit = 10) {
  const dateBucket = format(new Date(), "yyyy-MM-dd");
  const topics = await prisma.topic.findMany({
    where: {
      dateBucket,
      status: "new",
      kind: "question",
    },
    orderBy: [{ score: "desc" }, { frequency: "desc" }],
    take: limit,
  });

  const results = [];
  for (const topic of topics) {
    const script = await createScriptForTopic(topic.id);
    results.push(script);
  }
  return results;
}
