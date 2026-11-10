"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  topicId: string;
  hasScript: boolean;
  status: string;
  showViewScript?: boolean;
  requireSelectedHook?: boolean;
  initialNotes?: string;
  showNotesField?: boolean;
  kind?: string;
};

export function TopicActions({
  topicId,
  hasScript,
  status,
  showViewScript = true,
  requireSelectedHook = false,
  initialNotes = "",
  showNotesField = true,
  kind,
}: Props) {
  const long = kind === "youtube";
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState(initialNotes);
  const [notesOpen, setNotesOpen] = useState(Boolean(initialNotes));

  async function run(action: string, fn: () => Promise<void>) {
    setLoading(action);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }

  const canGenerate =
    (!hasScript || status !== "discarded") && status !== "discarded";
  const showGenerate = !hasScript && status !== "discarded";
  const showRegenerate = hasScript && status !== "discarded";

  return (
    <div className="mt-4 flex flex-col gap-2">
      {showNotesField && canGenerate && (showGenerate || showRegenerate) && !notesOpen && (
        <button
          type="button"
          className="self-start text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          onClick={() => setNotesOpen(true)}
        >
          + Adicionar suas ideias para o roteiro (opcional)
        </button>
      )}
      {showNotesField && canGenerate && (showGenerate || showRegenerate) && notesOpen && (
        <div className="space-y-1">
          <label className="text-sm text-[var(--ink-soft)]">
            Suas ideias sobre o tema (opcional)
          </label>
          <textarea
            className="field min-h-24 text-sm"
            placeholder="Ex.: falar da calibração de flow depois de trocar o bico, mencionar meu erro de não fazer isso..."
            value={userNotes}
            onChange={(e) => setUserNotes(e.target.value)}
            disabled={!!loading}
          />
        </div>
      )}

      <div className="actions-mobile flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {showGenerate && (
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("script", async () => {
                const res = await fetch(`/api/topics/${topicId}/script`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userNotes }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falha ao gerar");
              })
            }
          >
            {loading === "script"
              ? "Pesquisando + gerando..."
              : long
                ? "Gerar estrutura do vídeo"
                : "Gerar roteiro"}
          </button>
        )}

        {hasScript && showViewScript && (
          <Link
            href={`/roteiros?topic=${topicId}`}
            className="btn btn-secondary text-sm"
          >
            {long ? "Ver estrutura" : "Ver roteiro"}
          </Link>
        )}

        {showRegenerate && (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("script", async () => {
                const res = await fetch(`/api/topics/${topicId}/script`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userNotes }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falha ao gerar");
              })
            }
          >
            {loading === "script"
              ? "Pesquisando + gerando..."
              : long
                ? "Refazer estrutura"
                : "Regenerar roteiro"}
          </button>
        )}

        {hasScript && status !== "discarded" && (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("caption", async () => {
                const res = await fetch(`/api/topics/${topicId}/caption`, {
                  method: "POST",
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Falha na legenda");
              })
            }
          >
            {loading === "caption"
              ? "Gerando..."
              : long
                ? "Gerar descrição"
                : "Gerar legenda"}
          </button>
        )}

        {hasScript && status !== "recorded" && (
          <button
            type="button"
            className="btn btn-primary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("recorded", async () => {
                if (requireSelectedHook) {
                  throw new Error(
                    "Selecione o gancho usado na gravação antes de marcar como gravado",
                  );
                }
                const res = await fetch(`/api/topics/${topicId}/status`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "recorded" }),
                });
                if (!res.ok) throw new Error("Falha ao marcar");
              })
            }
          >
            {loading === "recorded" ? "Salvando..." : "Marcar gravado"}
          </button>
        )}

        <button
          type="button"
          className="btn btn-danger text-sm"
          disabled={!!loading}
          onClick={() => {
            const ok = window.confirm(
              "Tem certeza que deseja descartar? Isso remove a pergunta e o roteiro de forma permanente.",
            );
            if (!ok) return;
            run("discard", async () => {
              const res = await fetch(`/api/topics/${topicId}`, {
                method: "DELETE",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(data.error || "Falha ao descartar");
              }
            });
          }}
        >
          {loading === "discard" ? "Removendo..." : "Descartar"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
    </div>
  );
}
