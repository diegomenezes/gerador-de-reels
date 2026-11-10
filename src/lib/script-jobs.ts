import { createScriptForTopic } from "./pipeline";

// Geração de roteiro em segundo plano. Com pesquisa, transcrição e revisão ela pode passar
// de 1 minuto, e o nginx corta a requisição em 60s. Então a rota só dispara e a tela pergunta.
// O app roda numa instância só (PM2 fork), então guardar em memória basta.

type ScriptJob = { state: "running" | "done" | "error"; startedAt: number; error?: string };

const holder = globalThis as { __scriptJobs?: Map<string, ScriptJob> };
const jobs = (holder.__scriptJobs ??= new Map());

export function startScriptJob(
  topicId: string,
  options: { userNotes?: string; withTranscript?: boolean },
): ScriptJob {
  const current = jobs.get(topicId);
  if (current?.state === "running") return current;

  const job: ScriptJob = { state: "running", startedAt: Date.now() };
  jobs.set(topicId, job);
  createScriptForTopic(topicId, options)
    .then(() => {
      job.state = "done";
    })
    .catch((err) => {
      job.state = "error";
      job.error = err instanceof Error ? err.message : String(err);
      console.error("[roteiro]", topicId, job.error);
    });
  return job;
}

export function scriptJobStatus(topicId: string): ScriptJob | null {
  return jobs.get(topicId) ?? null;
}
