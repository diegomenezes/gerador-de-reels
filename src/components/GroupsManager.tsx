"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Group = {
  id: string;
  name: string;
  remoteJid: string;
  active: boolean;
};

export function GroupsManager({ initialGroups }: { initialGroups: Group[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [remoteJid, setRemoteJid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, remoteJid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar");
      setName("");
      setRemoteJid("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(group: Group) {
    await fetch(`/api/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !group.active }),
    });
    router.refresh();
  }

  async function remove(group: Group) {
    if (!confirm(`Remover grupo "${group.name}"?`)) return;
    await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createGroup} className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">Adicionar grupo</h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Use o remoteJid do WhatsApp (ex.: 120363...@g.us).
        </p>
        <input
          className="field"
          placeholder="Nome amigável"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="remoteJid (ex: 120363...@g.us)"
          value={remoteJid}
          onChange={(e) => setRemoteJid(e.target.value)}
          required
        />
        {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Salvando..." : "Salvar grupo"}
        </button>
      </form>

      <div className="space-y-3">
        {initialGroups.length === 0 && (
          <p className="text-[var(--ink-soft)]">Nenhum grupo cadastrado ainda.</p>
        )}
        {initialGroups.map((group) => (
          <div key={group.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{group.name}</p>
              <p className="text-sm text-[var(--ink-soft)]">{group.remoteJid}</p>
              <span className={`badge mt-2 ${group.active ? "" : "badge-muted"}`}>
                {group.active ? "Ativo" : "Inativo"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => toggleActive(group)}
              >
                {group.active ? "Desativar" : "Ativar"}
              </button>
              <button
                type="button"
                className="btn btn-danger text-sm"
                onClick={() => remove(group)}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
