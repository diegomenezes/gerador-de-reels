"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateTopButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/scripts/generate-top", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao gerar");
      setMessage(`${data.count} roteiro(s) gerado(s).`);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={generate}
        disabled={loading}
      >
        {loading ? "Gerando top 10..." : "Gerar top 10 roteiros"}
      </button>
      {message && <p className="text-sm text-[var(--ink-soft)]">{message}</p>}
    </div>
  );
}
