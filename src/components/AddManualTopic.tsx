"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddManualTopic() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [kind, setKind] = useState<"question" | "polemic">("question");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, userNotes, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar pergunta");
      setTitle("");
      setSummary("");
      setUserNotes("");
      setKind("question");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-2">
      {!open ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(true)}
        >
          Adicionar pergunta
        </button>
      ) : (
        <form onSubmit={submit} className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Nova pergunta</h3>
            <button
              type="button"
              className="text-sm text-[var(--ink-soft)]"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              disabled={loading}
            >
              Cancelar
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[var(--ink-soft)]">Tipo</label>
            <select
              className="field"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value === "polemic" ? "polemic" : "question")
              }
              disabled={loading}
            >
              <option value="question">Pergunta</option>
              <option value="polemic">Polêmico</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[var(--ink-soft)]">
              {kind === "polemic" ? "Frase do gancho" : "Pergunta / tema"}
            </label>
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Por que a peça não gruda na mesa?"
              required
              minLength={3}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[var(--ink-soft)]">
              Resumo (opcional)
            </label>
            <input
              className="field"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Uma linha sobre o problema"
              disabled={loading}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-[var(--ink-soft)]">
              Suas ideias (opcional)
            </label>
            <textarea
              className="field min-h-20 text-sm"
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="Pontos que você quer falar no roteiro..."
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={loading || title.trim().length < 3}
          >
            {loading ? "Salvando..." : "Salvar pergunta"}
          </button>

          {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
        </form>
      )}
    </div>
  );
}
