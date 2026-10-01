"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { TopicActions } from "@/components/TopicActions";

type ScriptCard = {
  id: string;
  topicId: string;
  content: string;
  hooks: string[];
  selectedHook: string | null;
  caption: string | null;
  model: string;
  createdAt: string;
  title: string;
  status: string;
  userNotes: string;
};

type Filter = "pending" | "recorded" | "all";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Pendentes" },
  { id: "recorded", label: "Gravados" },
  { id: "all", label: "Todos" },
];

const DEFAULT_HASHTAGS = "#impressao3d #bambulab #reels";

function extractHashtags(text: string | null | undefined): string {
  if (!text) return "";
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const unique = [...new Set(tags.map((t) => t.trim()))];
  return unique.slice(-3).join(" ");
}

function captionWithHashtags(caption: string): string {
  const trimmed = caption.trim();
  const tags = extractHashtags(trimmed);
  if (tags.split(/\s+/).filter(Boolean).length >= 3) return trimmed;
  return `${trimmed}\n\n${DEFAULT_HASHTAGS}`;
}

export function ScriptsBoard({ scripts }: { scripts: ScriptCard[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic");
  const [filter, setFilter] = useState<Filter>("pending");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [hooksByTopic, setHooksByTopic] = useState<Record<string, string[]>>(
    () => Object.fromEntries(scripts.map((s) => [s.topicId, s.hooks])),
  );
  const [selectedByTopic, setSelectedByTopic] = useState<
    Record<string, string | null>
  >(() => Object.fromEntries(scripts.map((s) => [s.topicId, s.selectedHook])));
  const [captionsByTopic, setCaptionsByTopic] = useState<
    Record<string, string | null>
  >(() => Object.fromEntries(scripts.map((s) => [s.topicId, s.caption])));
  const [loadingHooks, setLoadingHooks] = useState<string | null>(null);
  const [savingHook, setSavingHook] = useState<string | null>(null);

  const counts = useMemo(() => {
    const pending = scripts.filter((s) => s.status !== "recorded").length;
    const recorded = scripts.filter((s) => s.status === "recorded").length;
    return { pending, recorded, all: scripts.length };
  }, [scripts]);

  const visible = useMemo(() => {
    if (filter === "pending") {
      return scripts.filter((s) => s.status !== "recorded");
    }
    if (filter === "recorded") {
      return scripts.filter((s) => s.status === "recorded");
    }
    return scripts;
  }, [filter, scripts]);

  useEffect(() => {
    setHooksByTopic(
      Object.fromEntries(scripts.map((s) => [s.topicId, s.hooks])),
    );
    setSelectedByTopic(
      Object.fromEntries(scripts.map((s) => [s.topicId, s.selectedHook])),
    );
    setCaptionsByTopic(
      Object.fromEntries(scripts.map((s) => [s.topicId, s.caption])),
    );
  }, [scripts]);

  useEffect(() => {
    if (!topicId) return;
    const target = scripts.find((s) => s.topicId === topicId);
    if (target) {
      setFilter(target.status === "recorded" ? "recorded" : "pending");
    }
    setOpenIds((prev) => ({ ...prev, [topicId]: true }));
  }, [topicId, scripts]);

  useEffect(() => {
    if (!topicId) return;
    if (!visible.some((s) => s.topicId === topicId)) return;
    const el = document.getElementById(`script-topic-${topicId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [topicId, visible]);

  function toggle(id: string) {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function selectHook(scriptTopicId: string, hook: string) {
    setSavingHook(scriptTopicId);
    setSelectedByTopic((prev) => ({ ...prev, [scriptTopicId]: hook }));
    try {
      const res = await fetch(`/api/topics/${scriptTopicId}/selected-hook`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedHook: hook }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Falha ao salvar gancho");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingHook(null);
    }
  }

  async function regenerateHooks(scriptTopicId: string) {
    setLoadingHooks(scriptTopicId);
    try {
      const res = await fetch(`/api/topics/${scriptTopicId}/hooks`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao regenerar ganchos");
      setHooksByTopic((prev) => ({
        ...prev,
        [scriptTopicId]: data.hooks as string[],
      }));
      // limpa seleção antiga se regenerou a lista
      setSelectedByTopic((prev) => ({ ...prev, [scriptTopicId]: null }));
      await fetch(`/api/topics/${scriptTopicId}/selected-hook`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedHook: null }),
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingHooks(null);
    }
  }

  if (scripts.length === 0) {
    return (
      <div className="card p-6 text-[var(--ink-soft)]">
        Nenhum roteiro ainda. Gere a partir da tela Perguntas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`btn shrink-0 text-sm ${active ? "btn-primary" : "btn-secondary"}`}
            >
              {item.label}
              <span className={active ? "opacity-90" : "opacity-70"}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="card p-6 text-[var(--ink-soft)]">
          {filter === "pending" && "Nenhum roteiro pendente."}
          {filter === "recorded" && "Nenhum roteiro gravado ainda."}
          {filter === "all" && "Nenhum roteiro nesta lista."}
        </div>
      ) : null}

      {visible.map((script) => {
        const highlighted = topicId === script.topicId;
        const open = openIds[script.topicId] ?? false;
        const hooks = hooksByTopic[script.topicId] || [];
        const selectedHook = selectedByTopic[script.topicId];
        const caption = captionsByTopic[script.topicId];

        return (
          <article
            key={script.id}
            id={`script-topic-${script.topicId}`}
            className={`card space-y-3 p-5 ${
              highlighted ? "ring-2 ring-[var(--accent)]" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(script.topicId)}
              className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
            >
              <div>
                <h3 className="text-xl font-semibold">{script.title}</h3>
                <p className="text-sm text-[var(--ink-soft)]">
                  {new Date(script.createdAt).toLocaleString("pt-BR")} ·{" "}
                  {script.model}
                </p>
                {selectedHook && (
                  <p className="mt-1 text-sm text-[var(--accent)]">
                    Gancho usado: “{selectedHook}”
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`badge ${
                    script.status === "recorded" ? "" : "badge-warn"
                  }`}
                >
                  {script.status === "recorded" ? "Gravado" : "Pendente"}
                </span>
                <span className="btn btn-secondary text-sm">
                  {open ? "Fechar roteiro" : "Abrir roteiro"}
                </span>
              </div>
            </button>

            {open && (
              <>
                <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">Ganchos fortes</h4>
                      <p className="text-xs text-[var(--ink-soft)]">
                        Marque o gancho que você usou na gravação
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      disabled={loadingHooks === script.topicId}
                      onClick={() => regenerateHooks(script.topicId)}
                    >
                      {loadingHooks === script.topicId
                        ? "Gerando ganchos..."
                        : "Regenerar ganchos"}
                    </button>
                  </div>
                  {hooks.length === 0 ? (
                    <p className="text-sm text-[var(--ink-soft)]">
                      Nenhum gancho ainda. Clique em Regenerar ganchos.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {hooks.map((hook, index) => {
                        const inputId = `hook-${script.topicId}-${index}`;
                        const checked = selectedHook === hook;
                        return (
                          <li key={`${script.topicId}-${index}-${hook}`}>
                            <label
                              htmlFor={inputId}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 ${
                                checked
                                  ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                                  : "bg-[#fffdf8]"
                              }`}
                            >
                              <input
                                id={inputId}
                                type="radio"
                                name={`hooks-${script.topicId}`}
                                className="mt-1"
                                checked={checked}
                                disabled={savingHook === script.topicId}
                                onChange={() =>
                                  selectHook(script.topicId, hook)
                                }
                              />
                              <span>{hook}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <pre className="whitespace-pre-wrap rounded-xl bg-[#fffdf8] p-4 text-sm leading-relaxed text-[var(--ink)]">
                  {script.content}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <CopyButton label="Copiar roteiro" text={script.content} />
                </div>

                {caption && (
                  <div className="rounded-xl border border-[var(--line)] bg-white/70 p-4 space-y-2">
                    <h4 className="font-semibold">Legenda Instagram</h4>
                    <pre className="whitespace-pre-wrap rounded-xl bg-[#fffdf8] p-4 text-sm leading-relaxed text-[var(--ink)]">
                      {caption}
                    </pre>
                    <CopyButton
                      label="Copiar legenda"
                      text={captionWithHashtags(caption)}
                    />
                  </div>
                )}

                <TopicActions
                  topicId={script.topicId}
                  hasScript
                  status={script.status}
                  showViewScript={false}
                  requireSelectedHook={!selectedHook}
                  initialNotes={script.userNotes}
                />
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
