"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Job = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  running?: boolean;
  stage?: string;
  messagesIn: number;
  messagesKept: number;
  topicsCreated: number;
  error: string | null;
};

export function ConfigPanel({
  lastJob,
  initialTone,
  initialHookModels,
}: {
  lastJob: Job | null;
  initialTone: string;
  initialHookModels: string;
}) {
  const router = useRouter();
  const [tone, setTone] = useState(initialTone);
  const [hookModels, setHookModels] = useState(initialHookModels);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [liveJob, setLiveJob] = useState<Job | null>(lastJob);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }

  useEffect(() => {
    setLiveJob(lastJob);
    if (lastJob?.running) {
      startWatching(lastJob.id, lastJob.startedAt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastJob?.id, lastJob?.running]);

  useEffect(() => {
    return () => clearTimers();
  }, []);

  function startWatching(jobId: string, startedAtIso?: string) {
    clearTimers();
    setBusy("run");
    setElapsed(0);
    const startedAt = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();

    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/status?jobId=${jobId}`);
        const data = await res.json();
        if (!data.job) return;
        setLiveJob(data.job);

        if (!data.job.running) {
          clearTimers();
          setBusy(null);
          if (data.job.success) {
            setInfo(
              `OK: ${data.job.messagesIn} msgs lidas, ${data.job.messagesKept} úteis, ${data.job.topicsCreated} dúvidas.`,
            );
          } else {
            setInfo(data.job.error || "Pipeline falhou.");
          }
          router.refresh();
        }
      } catch {
        // mantém polling
      }
    }, 1500);
  }

  async function saveTone() {
    setBusy("tone");
    setInfo(null);
    const res = await fetch("/api/tone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: tone }),
    });
    setBusy(null);
    setInfo(res.ok ? "Tom de voz salvo." : "Falha ao salvar tom de voz.");
  }

  async function saveHookModels() {
    setBusy("hooks");
    setInfo(null);
    const res = await fetch("/api/hook-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: hookModels }),
    });
    setBusy(null);
    setInfo(
      res.ok
        ? "Modelos de ganchos salvos."
        : "Falha ao salvar modelos de ganchos.",
    );
  }

  async function runNow() {
    setInfo("Iniciando job... isso pode levar 1–3 minutos.");
    setBusy("run");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setBusy(null);
        setInfo(data.error || "Falha ao iniciar job.");
        return;
      }
      startWatching(data.jobId);
      if (data.alreadyRunning) {
        setInfo("Já havia um job em andamento — acompanhando ele.");
      }
    } catch (err) {
      setBusy(null);
      setInfo(err instanceof Error ? err.message : "Falha de rede ao iniciar job.");
    }
  }

  async function testEvolution() {
    setBusy("evo");
    setInfo(null);
    const res = await fetch("/api/evolution/test", { method: "POST" });
    const data = await res.json();
    setBusy(null);
    setInfo(data.ok ? `Evolution OK: ${data.detail}` : `Evolution falhou: ${data.detail}`);
  }

  const running = busy === "run" || liveJob?.running;

  return (
    <div className="space-y-6">
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Job diário</h2>
        {liveJob ? (
          <div className="space-y-1 text-sm text-[var(--ink-soft)]">
            <p>
              Último: {new Date(liveJob.startedAt).toLocaleString("pt-BR")} —{" "}
              <strong
                className={
                  liveJob.running
                    ? "text-[var(--ink)]"
                    : liveJob.success
                      ? "text-[var(--accent)]"
                      : "text-[var(--warn)]"
                }
              >
                {liveJob.running
                  ? "em andamento"
                  : liveJob.success
                    ? "sucesso"
                    : "erro"}
              </strong>
            </p>
            <p>
              Etapa: <strong>{liveJob.stage || "—"}</strong>
              {running ? ` · ${elapsed}s` : ""}
            </p>
            <p>
              Mensagens: {liveJob.messagesIn} | Úteis: {liveJob.messagesKept} |
              Dúvidas: {liveJob.topicsCreated}
            </p>
            {liveJob.error && (
              <p className="text-[var(--warn)]">{liveJob.error}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-soft)]">
            Nenhum job executado ainda.
          </p>
        )}

        {running && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
            Processando… {liveJob?.stage || "aguarde"} ({elapsed}s). Não feche
            esta página.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!!busy}
            onClick={runNow}
          >
            {busy === "run" ? `Rodando... ${elapsed}s` : "Rodar agora"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!!busy}
            onClick={testEvolution}
          >
            {busy === "evo" ? "Testando..." : "Testar Evolution"}
          </button>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Tom de voz (tomdevoz.md)</h2>
        <textarea
          className="field min-h-72 font-mono text-sm"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy}
          onClick={saveTone}
        >
          {busy === "tone" ? "Salvando..." : "Salvar tom de voz"}
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">
          Modelos de ganchos (modelosganchos.md)
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Cole aqui seus ~100 modelos. A IA usa como base de estrutura para
          sugerir ganchos fortes em cada roteiro.
        </p>
        <textarea
          className="field min-h-72 font-mono text-sm"
          value={hookModels}
          onChange={(e) => setHookModels(e.target.value)}
          placeholder="Cole seus modelos de ganchos aqui..."
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={!!busy}
          onClick={saveHookModels}
        >
          {busy === "hooks" ? "Salvando..." : "Salvar modelos de ganchos"}
        </button>
      </section>

      {info && (
        <p className="rounded-xl border border-[var(--line)] bg-white/70 p-3 text-sm">
          {info}
        </p>
      )}
    </div>
  );
}
