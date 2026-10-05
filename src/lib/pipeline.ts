import { format } from "date-fns";
import { prisma } from "./db";
import { fetchGroupMessages } from "./evolution";
import { compactMessages } from "./filter";
import { readHookModels } from "./hook-models";
import {
  clusterDoubts,
  generateHookSuggestions,
  generateInstagramCaption,
  generateReelScript,
} from "./openai";
import { readToneOfVoice } from "./tone";

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

export async function runDailyPipeline(
  existingJobId?: string,
): Promise<PipelineResult> {
  const job = existingJobId
    ? await prisma.jobRun.update({
        where: { id: existingJobId },
        data: { running: true, stage: "Iniciando...", error: null },
      })
    : await prisma.jobRun.create({
        data: { running: true, stage: "Iniciando..." },
      });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateBucket = format(new Date(), "yyyy-MM-dd");

  let messagesIn = 0;
  let messagesKept = 0;
  let topicsCreated = 0;

  try {
    const groups = await prisma.group.findMany({ where: { active: true } });
    if (groups.length === 0) {
      throw new Error("Nenhum grupo ativo cadastrado");
    }

    for (const [index, group] of groups.entries()) {
      await setStage(
        job.id,
        `Lendo grupo ${index + 1}/${groups.length}: ${group.name}`,
        { messagesIn },
      );

      const remoteMessages = await fetchGroupMessages({
        remoteJid: group.remoteJid,
        since,
        maxPages: 4,
      });
      messagesIn += remoteMessages.length;

      for (const msg of remoteMessages) {
        await prisma.message.upsert({
          where: {
            groupId_waMessageId: {
              groupId: group.id,
              waMessageId: msg.waMessageId,
            },
          },
          create: {
            groupId: group.id,
            waMessageId: msg.waMessageId,
            author: msg.author,
            text: msg.text,
            timestamp: msg.timestamp,
          },
          update: {
            text: msg.text,
            author: msg.author,
            timestamp: msg.timestamp,
          },
        });
      }
    }

    await setStage(job.id, "Filtrando dúvidas...", { messagesIn });

    const recent = await prisma.message.findMany({
      where: { timestamp: { gte: since } },
      select: { text: true },
      orderBy: { timestamp: "desc" },
      take: 5000,
    });

    const compact = compactMessages(
      recent.map((m) => m.text),
      120,
    );
    messagesKept = compact.reduce((acc, m) => acc + m.count, 0);

    await setStage(job.id, "Agrupando dúvidas com IA...", {
      messagesIn,
      messagesKept,
    });

    const clustered = await clusterDoubts(compact, 20);

    const existingToday = await prisma.topic.findMany({
      where: { dateBucket },
      select: { title: true },
    });
    const seenTitles = new Set(
      existingToday.map((t) => t.title.trim().toLowerCase()),
    );

    await setStage(job.id, "Salvando dúvidas...", {
      messagesIn,
      messagesKept,
    });

    for (const topic of clustered) {
      const key = topic.title.trim().toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);

      await prisma.topic.create({
        data: {
          title: topic.title,
          summary: topic.summary,
          frequency: topic.frequency,
          score: topic.score,
          dateBucket,
          status: "new",
          examples: {
            create: topic.examples.slice(0, 5).map((text) => ({ text })),
          },
        },
      });
      topicsCreated += 1;
    }

    await prisma.jobRun.update({
      where: { id: job.id },
      data: {
        finishedAt: new Date(),
        success: true,
        running: false,
        stage: "Concluído",
        messagesIn,
        messagesKept,
        topicsCreated,
      },
    });

    return {
      jobId: job.id,
      success: true,
      messagesIn,
      messagesKept,
      topicsCreated,
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
        topicsCreated,
        error,
      },
    });
    return {
      jobId: job.id,
      success: false,
      messagesIn,
      messagesKept,
      topicsCreated,
      error,
      stage: "Erro",
    };
  }
}

export async function createScriptForTopic(
  topicId: string,
  options?: { userNotes?: string },
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
  });

  const hooks = keepHooks
    ? previous.hooks
    : JSON.stringify(
        await generateHookSuggestions({
          title: topic.title,
          summary: topic.summary,
          examples,
          hookModels,
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
