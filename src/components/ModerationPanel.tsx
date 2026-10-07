"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Domain = { id: string; domain: string };
type Whitelist = { id: string; url: string };
type EventRow = {
  id: string;
  groupName: string;
  author: string;
  text: string;
  matchedUrl: string;
  action: string;
  detail: string | null;
  messageAt: string;
};

type Props = {
  enabled: boolean;
  deleteMode: boolean;
  notifyNumber: string;
  domains: Domain[];
  whitelist: Whitelist[];
  events: EventRow[];
  webhookMessage: string;
  webhookUrl: string;
};

const ACTION_LABEL: Record<string, string> = {
  notified: "Avisado",
  deleted: "Apagado",
  delete_failed: "Aviso ok, apagar falhou",
  notify_failed: "Falha no aviso",
  deleted_notify_failed: "Apagado, aviso falhou",
  pending: "Processando",
};

export function ModerationPanel({
  enabled,
  deleteMode,
  notifyNumber,
  domains,
  whitelist,
  events,
  webhookMessage,
  webhookUrl,
}: Props) {
  const router = useRouter();
  const [groupJid, setGroupJid] = useState(notifyNumber);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [willDelete, setWillDelete] = useState(deleteMode);
  const [domain, setDomain] = useState("");
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setLoading(key);
    setError(null);
    setInfo(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <div>
          <h3 className="font-semibold">Modo</h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Começa só avisando. Apagar fica desligado até você ligar.
            Admins do grupo ficam de fora, assim como o número conectado na
            Evolution.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
          />
          Moderação ligada
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={willDelete}
            onChange={(e) => setWillDelete(e.target.checked)}
          />
          Apagar a mensagem no grupo (além de avisar)
        </label>
        <div className="space-y-1">
          <label className="text-sm text-[var(--ink-soft)]">
            Grupo que recebe o aviso
          </label>
          <input
            className="field"
            value={groupJid}
            onChange={(e) => setGroupJid(e.target.value)}
            placeholder="120363405756239332@g.us"
          />
          <p className="text-sm text-[var(--ink-soft)]">
            ID do grupo, no mesmo formato da aba Grupos. O WhatsApp conectado
            na Evolution precisa participar desse grupo.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary text-sm"
          disabled={!!loading}
          onClick={() =>
            run("settings", async () => {
              const res = await fetch("/api/moderation/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  enabled: isEnabled,
                  deleteMode: willDelete,
                  notifyNumber: groupJid,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Falha ao salvar");
              setInfo("Configuração salva.");
            })
          }
        >
          {loading === "settings" ? "Salvando..." : "Salvar"}
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <h3 className="font-semibold">Webhook da Evolution</h3>
        <p className="text-sm text-[var(--ink-soft)]">{webhookMessage}</p>
        <p className="break-all text-sm">{webhookUrl}</p>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={!!loading}
          onClick={() =>
            run("webhook", async () => {
              const res = await fetch("/api/moderation/webhook-register", {
                method: "POST",
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Falha ao registrar");
              setInfo(data.message);
            })
          }
        >
          {loading === "webhook" ? "Registrando..." : "Registrar webhook"}
        </button>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={!!loading}
          onClick={() =>
            run("scan", async () => {
              const res = await fetch("/api/moderation/scan", { method: "POST" });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Falha no teste");
              setInfo(
                `Teste: ${data.checked} mensagem(ns) recente(s), ${data.flagged} alerta(s).`,
              );
            })
          }
        >
          {loading === "scan" ? "Testando..." : "Testar mensagens dos últimos 30 min"}
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <h3 className="font-semibold">Domínios bloqueados</h3>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run("domain", async () => {
              const res = await fetch("/api/moderation/domains", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Falha ao adicionar");
              setDomain("");
            });
          }}
        >
          <input
            className="field"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="ex.: magazineluiza.com.br"
          />
          <button type="submit" className="btn btn-secondary text-sm" disabled={!!loading}>
            Adicionar
          </button>
        </form>
        <ul className="space-y-2 text-sm">
          {domains.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span>{item.domain}</span>
              <button
                type="button"
                className="btn btn-danger text-sm"
                onClick={() =>
                  run(`domain-${item.id}`, async () => {
                    const res = await fetch(`/api/moderation/domains/${item.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) throw new Error("Falha ao remover");
                  })
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-3 p-5">
        <h3 className="font-semibold">Convites autorizados</h3>
        <p className="text-sm text-[var(--ink-soft)]">
          Links chat.whatsapp.com que podem ser divulgados no grupo.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run("invite", async () => {
              const res = await fetch("/api/moderation/whitelist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: invite }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Falha ao adicionar");
              setInvite("");
            });
          }}
        >
          <input
            className="field"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            placeholder="https://chat.whatsapp.com/..."
          />
          <button type="submit" className="btn btn-secondary text-sm" disabled={!!loading}>
            Adicionar
          </button>
        </form>
        <ul className="space-y-2 text-sm">
          {whitelist.length === 0 && (
            <li className="text-[var(--ink-soft)]">Nenhum convite autorizado.</li>
          )}
          {whitelist.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span className="break-all">{item.url}</span>
              <button
                type="button"
                className="btn btn-danger shrink-0 text-sm"
                onClick={() =>
                  run(`invite-${item.id}`, async () => {
                    const res = await fetch(`/api/moderation/whitelist/${item.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) throw new Error("Falha ao remover");
                  })
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Histórico</h3>
          {events.length > 0 && (
            <button
              type="button"
              className="btn btn-danger text-sm"
              disabled={!!loading}
              onClick={() => {
                if (!window.confirm("Apagar todo o histórico de alertas?")) return;
                run("events-all", async () => {
                  const res = await fetch("/api/moderation/events", {
                    method: "DELETE",
                  });
                  if (!res.ok) throw new Error("Falha ao apagar o histórico");
                });
              }}
            >
              {loading === "events-all" ? "Apagando..." : "Apagar todos"}
            </button>
          )}
        </div>
        {events.length === 0 ? (
          <div className="card p-5 text-sm text-[var(--ink-soft)]">
            Nenhum link barrado ainda.
          </div>
        ) : (
          events.map((event) => (
            <article key={event.id} className="card space-y-2 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{event.groupName}</p>
                <div className="flex items-center gap-2">
                  <span className="badge badge-warn">
                    {ACTION_LABEL[event.action] || event.action}
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger text-sm"
                    disabled={!!loading}
                    onClick={() =>
                      run(`event-${event.id}`, async () => {
                        const res = await fetch(
                          `/api/moderation/events/${event.id}`,
                          { method: "DELETE" },
                        );
                        if (!res.ok) throw new Error("Falha ao apagar o alerta");
                      })
                    }
                  >
                    {loading === `event-${event.id}` ? "Apagando..." : "Apagar"}
                  </button>
                </div>
              </div>
              <p className="text-sm text-[var(--ink-soft)]">
                {event.author} ·{" "}
                {new Date(event.messageAt).toLocaleString("pt-BR")}
              </p>
              <p className="break-all text-sm">{event.matchedUrl}</p>
              <pre className="whitespace-pre-wrap rounded-xl bg-[#fffdf8] p-3 text-sm">
                {event.text}
              </pre>
              {event.detail && (
                <p className="text-sm text-[var(--warn)]">{event.detail}</p>
              )}
            </article>
          ))
        )}
      </section>

      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}
      {info && <p className="text-sm text-[var(--ink-soft)]">{info}</p>}
    </div>
  );
}
