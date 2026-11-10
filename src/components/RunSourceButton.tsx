"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type JobSummary = {
  id: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  running: boolean;
  success: boolean;
  stage: string;
  topicsCreated: number;
  messagesIn: number;
  videosIn: number;
  error: string | null;
};

function when(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Roda uma fonte de ideias e mostra o andamento na própria tela. */
export function RunSourceButton({
  mode,
  label,
  lastJob,
  hint,
}: {
  mode: "group" | "viral" | "youtube" | "daily";
  label: string;
  lastJob: JobSummary | null;
  hint?: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<JobSummary | null>(lastJob);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  function stop() {
    timers.current.forEach(clearInterval);
    timers.current = [];
  }

  function watch(id: string, startedAt: string) {
    stop();
    const start = new Date(startedAt).getTime();
    timers.current.push(
      setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000),
      setInterval(async () => {
        try {
          const res = await fetch(`/api/pipeline/status?jobId=${id}`);
          const data = await res.json();
          if (!data.job) return;
          setJob(data.job);
          if (!data.job.running) {
            stop();
            router.refresh();
          }
        } catch {
          // continua tentando
        }
      }, 2000),
    );
  }

  useEffect(() => {
    if (lastJob?.running) watch(lastJob.id, lastJob.startedAt);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- acompanha só o job inicial
  }, [lastJob?.id]);

  async function start() {
    setError(null);
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não consegui iniciar");
      if (data.alreadyRunning) {
        setError("Já tem uma busca rodando. Acompanhando ela.");
      }
      const now = new Date().toISOString();
      setJob({
        id: data.jobId,
        mode,
        startedAt: now,
        finishedAt: null,
        running: true,
        success: false,
        stage: data.stage || "Iniciando...",
        topicsCreated: 0,
        messagesIn: 0,
        videosIn: 0,
        error: null,
      });
      watch(data.jobId, now);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const running = job?.running;

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <button type="button" className="btn btn-primary" disabled={!!running} onClick={start}>
        {running ? `Buscando… ${elapsed}s` : label}
      </button>
      <p className="text-xs text-[var(--ink-soft)] sm:text-right">
        {running ? (
          <span className="text-[var(--accent)]">{job?.stage}</span>
        ) : job ? (
          job.success ? (
            <>
              Última busca {when(job.startedAt)} · {job.topicsCreated} ideia(s) nova(s)
            </>
          ) : (
            <span className="text-[var(--warn)]">
              Última busca {when(job.startedAt)} falhou: {job.error?.slice(0, 140)}
            </span>
          )
        ) : (
          hint || "Ainda não rodou."
        )}
      </p>
      {error && <p className="text-xs text-[var(--warn)]">{error}</p>}
    </div>
  );
}
