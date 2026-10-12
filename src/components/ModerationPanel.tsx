"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Domain = { id: string; domain: string };
type Whitelist = { id: string; url: string };
type SenderRank = {
  name: string;
  phone: string | null;
  count: number;
};

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

type LatestMessage = {
  remoteJid: string;
  name: string;
  active: boolean;
  at: string | null;
  preview: string;
  fromMe: boolean;
  author: string | null;
  error: string | null;
};

type GroupRef = {
  remoteJid: string;
  name: string;
  active: boolean;
};

type Props = {
  enabled: boolean;
  deleteMode: boolean;
  notifyNumber: string;
  domains: Domain[];
  whitelist: Whitelist[];
  events: EventRow[];
  offenders: SenderRank[];
  webhookMessage: string;
  webhookUrl: string;
  evolution: { ok: boolean; title: string; detail: string };
  groups: GroupRef[];
  announceDelete: boolean;
  announceText: string;
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
  offenders,
  webhookMessage,
  webhookUrl,
  evolution,
  groups,
  announceDelete,
  announceText,
}: Props) {
  const router = useRouter();
  const [latestByJid, setLatestByJid] = useState<Record<string, LatestMessage>>(
    {},
  );
  const [groupJid, setGroupJid] = useState(notifyNumber);
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [willDelete, setWillDelete] = useState(deleteMode);
  const [willAnnounce, setWillAnnounce] = useState(announceDelete);
  const [announcement, setAnnouncement] = useState(announceText);
  const [domain, setDomain] = useState("");
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLatestByJid({});

    async function load() {
      for (const group of groups) {
        if (cancelled) return;
        let row: LatestMessage;
        try {
          const res = await fetch(
            `/api/moderation/latest?remoteJid=${encodeURIComponent(group.remoteJid)}`,
          );
          const data = (await res.json()) as {
            error?: string;
            latest?: LatestMessage;
          };
          if (!res.ok || !data.latest) {
            throw new Error(data.error ?? "Não consegui ler a última mensagem.");
          }
          row = data.latest;
        } catch (err) {
          row = {
            remoteJid: group.remoteJid,
            name: group.name,
            active: group.active,
            at: null,
            preview: "",
            fromMe: false,
            author: null,
            error:
              err instanceof Error
                ? err.message
                : "Não consegui ler a última mensagem.",
          };
        }
        if (!cancelled) {
          setLatestByJid((current) => ({ ...current, [group.remoteJid]: row }));
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [groups]);

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
      <section
        className="card flex items-start gap-3 p-4"
        style={
          evolution.ok
            ? undefined
            : { background: "#fef2f2", borderColor: "rgba(185, 28, 28, 0.35)" }
        }
      >
        <span
          className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ background: evolution.ok ? "var(--accent)" : "#dc2626" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className="font-semibold"
            style={evolution.ok ? undefined : { color: "#b91c1c" }}
          >
            {evolution.title}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{evolution.detail}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Últimas mensagens dos grupos
            </summary>
            <ul className="mt-3 space-y-3">
              {groups.length === 0 && (
                <li className="text-sm text-[var(--ink-soft)]">
                  Nenhum grupo cadastrado.
                </li>
              )}
              {groups.map((group) => {
                const item = latestByJid[group.remoteJid];
                return (
                  <li key={group.remoteJid} className="text-sm">
                    <p className="font-medium">
                      {group.name}
                      {group.active ? "" : " · pausado"}
                    </p>
                    {item ? (
                      <>
                        <p className="text-[var(--ink-soft)]">
                          {item.at ?? "Sem data"}
                          {item.fromMe ? " · enviada pela Evolution" : ""}
                          {item.author && !item.fromMe ? ` · ${item.author}` : ""}
                        </p>
                        <p className="mt-1 break-words">
                          {item.error ?? item.preview}
                        </p>
                      </>
                    ) : (
                      <p className="text-[var(--ink-soft)]">Lendo…</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        </div>
      </section>
      <section className="card space-y-4 p-5">
        <div>
          <h3 className="font-semibold">Modo</h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Começa só avisando. Apagar fica desligado até você ligar.
            Admins do grupo ficam de fora, assim como o número conectado na
            Evolution. Com apagar ligado, a mensagem sai para todos no grupo.
            Esse número precisa ser admin do grupo.
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={willAnnounce}
            onChange={(e) => setWillAnnounce(e.target.checked)}
          />
          Avisar no grupo que a mensagem foi apagada
        </label>
        <div className="space-y-1">
          <label className="text-sm text-[var(--ink-soft)]">
            Mensagem depois de apagar
          </label>
          <textarea
            className="field min-h-24"
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            maxLength={1000}
          />
          <p className="text-sm text-[var(--ink-soft)]">
            Sai no grupo em que a mensagem foi apagada, só com esta opção ligada.
            *assim* fica em negrito no WhatsApp. No final, o bot marca o telefone
            de quem enviou o link, para a pessoa receber o aviso.
          </p>
        </div>
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
        <div className="flex flex-wrap gap-2">
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
                    announceDelete: willAnnounce,
                    announceText: announcement,
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
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("test-message", async () => {
                const res = await fetch("/api/moderation/test", { method: "POST" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  throw new Error(data.error || "Falha ao disparar o teste");
                }
                setInfo("Mensagem de teste enviada para o grupo de aviso.");
              })
            }
          >
            {loading === "test-message" ? "Enviando..." : "DISPARAR MENSAGEM TESTE"}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!!loading}
            onClick={() =>
              run("test-delete", async () => {
                const res = await fetch("/api/moderation/test-delete", {
                  method: "POST",
                });
                const data = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  confirmed?: boolean;
                };
                if (!res.ok) {
                  throw new Error(data.error || "Falha ao testar a exclusão");
                }
                setInfo(
                  data.confirmed
                    ? "A frase de teste foi apagada para todos e o aviso de moderação foi enviado em seguida."
                    : "A Evolution aceitou apagar e o aviso de moderação foi enviado. Confira no grupo de aviso se a frase de teste sumiu.",
                );
              })
            }
          >
            {loading === "test-delete" ? "Testando..." : "TESTAR APAGAR"}
          </button>
        </div>
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

      <section className="card space-y-3 p-5">
        <h3 className="font-semibold">Quem mais mandou link bloqueado</h3>
        <p className="text-sm text-[var(--ink-soft)]">
          Uma vez pode ter sido sem querer. Quem chegou a três, vale tirar do grupo.
        </p>
        {offenders.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)]">Ninguém ainda.</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 font-semibold text-[var(--ink-soft)]">
              <span>Nome</span>
              <span>Telefone</span>
              <span className="text-right">Vezes</span>
            </div>
            {offenders.map((person) => (
              <div
                key={person.phone ?? person.name}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-3"
              >
                <span className="font-medium">{person.name}</span>
                <span>{person.phone ? `+${person.phone}` : "sem telefone"}</span>
                <span
                  className={`justify-self-end ${person.count >= 3 ? "badge badge-warn" : "badge"}`}
                >
                  {person.count}
                </span>
              </div>
            ))}
          </div>
        )}
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
