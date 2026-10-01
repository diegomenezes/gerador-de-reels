"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Senha inválida");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-1 py-8">
      <form onSubmit={onSubmit} className="card w-full max-w-md space-y-4 p-5 md:p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
            Acesso
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Gerador Reels</h1>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Entre com a senha do painel para ver as dúvidas do dia.
          </p>
        </div>
        <input
          type="password"
          className="field"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
