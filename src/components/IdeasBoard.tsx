"use client";

import { useMemo, useState } from "react";
import { TopicActions } from "@/components/TopicActions";

export type IdeaKind = "question" | "polemic" | "viral" | "youtube";

export type IdeaCard = {
  id: string;
  title: string;
  summary: string;
  frequency: number;
  score: number;
  dateBucket: string;
  status: string;
  kind: IdeaKind;
  hasScript: boolean;
  userNotes: string;
  examples: { id: string; text: string; url: string | null }[];
};

type ScriptFilter = "without" | "with" | "all";

const SCRIPT_FILTERS: { id: ScriptFilter; label: string }[] = [
  { id: "without", label: "Sem roteiro" },
  { id: "with", label: "Com roteiro" },
  { id: "all", label: "Todas" },
];

const STATUS_LABEL: Record<string, string> = {
  scripted: "Com roteiro",
  recorded: "Gravado",
};

function formatDay(dateBucket: string) {
  const [year, month, day] = dateBucket.split("-");
  if (!year || !month || !day) return dateBucket;
  return `${day}/${month}`;
}

/** "TikTok · 3,8 mi views · legenda" → partes (aceita o formato antigo com idioma). */
function parseReference(text: string) {
  const parts = text.split(" · ");
  if (parts.length >= 3 && /^[A-Z]{2}$/.test(parts[1])) parts.splice(1, 1);
  const [platform, views, ...rest] = parts;
  return {
    platform: platform || "Vídeo",
    views: views?.includes("views") ? views : "",
    caption: (views?.includes("views") ? rest.join(" · ") : parts.slice(1).join(" · ")).trim(),
  };
}

function Reference({ text, url }: { text: string; url: string }) {
  const ref = parseReference(text);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2">
      <span className="badge badge-muted">{ref.platform}</span>
      {ref.views && <span className="text-sm font-medium">{ref.views}</span>}
      <span className="min-w-0 flex-1 basis-48 truncate text-sm text-[var(--ink-soft)]">
        {ref.caption}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn min-h-0 shrink-0 border-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
      >
        Ver vídeo original ↗
      </a>
    </li>
  );
}

export function IdeasBoard({
  ideas,
  tabs,
  emptyText,
}: {
  ideas: IdeaCard[];
  /** abas por tipo (ex.: Perguntas / Polêmicos no grupo) */
  tabs?: { id: IdeaKind; label: string }[];
  emptyText: string;
}) {
  const [tab, setTab] = useState<IdeaKind | null>(tabs?.[0]?.id ?? null);
  const [scriptFilter, setScriptFilter] = useState<ScriptFilter>("without");
  const [day, setDay] = useState("all");

  const byTab = useMemo(
    () => (tab ? ideas.filter((i) => i.kind === tab) : ideas),
    [tab, ideas],
  );
  const days = useMemo(
    () => [...new Set(byTab.map((i) => i.dateBucket))].sort((a, b) => b.localeCompare(a)),
    [byTab],
  );
  const byDay = useMemo(
    () => (day === "all" ? byTab : byTab.filter((i) => i.dateBucket === day)),
    [day, byTab],
  );
  const counts = {
    without: byDay.filter((i) => !i.hasScript).length,
    with: byDay.filter((i) => i.hasScript).length,
    all: byDay.length,
  };
  const visible =
    scriptFilter === "without"
      ? byDay.filter((i) => !i.hasScript)
      : scriptFilter === "with"
        ? byDay.filter((i) => i.hasScript)
        : byDay;

  return (
    <div className="space-y-4">
      {tabs && (
        <div className="flex gap-1 rounded-full border border-[var(--line)] bg-white/50 p-1 sm:w-fit">
          {tabs.map((t) => {
            const active = tab === t.id;
            const count = ideas.filter((i) => i.kind === t.id && !i.hasScript).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full px-4 py-2 text-sm sm:flex-none ${
                  active ? "bg-[var(--accent)] font-semibold text-white" : "text-[var(--ink-soft)]"
                }`}
              >
                {t.label} <span className="opacity-75">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {SCRIPT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setScriptFilter(f.id)}
            className={`btn min-h-0 px-3 py-1.5 text-sm ${
              scriptFilter === f.id ? "btn-primary" : "btn-secondary"
            }`}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
        <select
          aria-label="Dia"
          className="field ml-auto w-auto py-1.5 text-sm"
          value={day}
          onChange={(e) => setDay(e.target.value)}
        >
          <option value="all">Todos os dias</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {formatDay(d)}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="card p-6 text-[var(--ink-soft)]">
          {ideas.length === 0 ? emptyText : "Nada neste filtro."}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((idea) => {
            const videoIdea = idea.kind === "viral" || idea.kind === "youtube";
            const refs = idea.examples.filter((e) => e.url);
            return (
              <article key={idea.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      {formatDay(idea.dateBucket)} · potencial {Math.round(idea.score)}
                      {!videoIdea && idea.frequency > 1 ? ` · ${idea.frequency}x no grupo` : ""}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold leading-snug">{idea.title}</h3>
                  </div>
                  {idea.hasScript && (
                    <span className={`badge ${idea.status === "recorded" ? "" : "badge-muted"}`}>
                      {STATUS_LABEL[idea.status] || "Com roteiro"}
                    </span>
                  )}
                </div>

                <p className="text-[var(--ink-soft)]">{idea.summary}</p>

                {videoIdea && refs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      Vídeos que inspiraram
                    </p>
                    <ul className="space-y-2">
                      {refs.map((ref) => (
                        <Reference key={ref.id} text={ref.text} url={ref.url!} />
                      ))}
                    </ul>
                  </div>
                )}

                {!videoIdea && idea.examples.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                      O que falaram no grupo
                    </p>
                    <ul className="space-y-1 border-l-2 border-[var(--line)] pl-3 text-sm text-[var(--ink-soft)]">
                      {idea.examples.slice(0, 3).map((ex) => (
                        <li key={ex.id}>“{ex.text}”</li>
                      ))}
                    </ul>
                  </div>
                )}

                <TopicActions
                  topicId={idea.id}
                  hasScript={idea.hasScript}
                  status={idea.status}
                  initialNotes={idea.userNotes}
                  kind={idea.kind}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
