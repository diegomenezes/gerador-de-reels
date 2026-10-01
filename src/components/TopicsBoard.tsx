"use client";

import { useMemo, useState } from "react";
import { TopicActions } from "@/components/TopicActions";

type TopicCard = {
  id: string;
  title: string;
  summary: string;
  frequency: number;
  score: number;
  status: string;
  hasScript: boolean;
  userNotes: string;
  examples: { id: string; text: string }[];
};

type Filter = "without" | "with" | "all";

const STATUS_LABEL: Record<string, string> = {
  new: "Nova",
  scripted: "Com roteiro",
  recorded: "Gravado",
  discarded: "Descartada",
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "without", label: "Sem roteiro" },
  { id: "with", label: "Com roteiro" },
  { id: "all", label: "Todas" },
];

export function TopicsBoard({ topics }: { topics: TopicCard[] }) {
  const [filter, setFilter] = useState<Filter>("without");

  const counts = useMemo(() => {
    const without = topics.filter((t) => !t.hasScript).length;
    const withScript = topics.filter((t) => t.hasScript).length;
    return { without, with: withScript, all: topics.length };
  }, [topics]);

  const visible = useMemo(() => {
    if (filter === "without") return topics.filter((t) => !t.hasScript);
    if (filter === "with") return topics.filter((t) => t.hasScript);
    return topics;
  }, [filter, topics]);

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          const count =
            item.id === "without"
              ? counts.without
              : item.id === "with"
                ? counts.with
                : counts.all;
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
          {filter === "without" && "Nenhuma dúvida sem roteiro."}
          {filter === "with" && "Nenhuma dúvida com roteiro ainda."}
          {filter === "all" && "Nenhuma dúvida nesta lista."}
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((topic, index) => (
            <article key={topic.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                    #{index + 1} · score {Math.round(topic.score)}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold">{topic.title}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="badge">{topic.frequency}x</span>
                  <span
                    className={`badge ${
                      topic.hasScript
                        ? topic.status === "recorded"
                          ? ""
                          : "badge-muted"
                        : "badge-warn"
                    }`}
                  >
                    {topic.hasScript
                      ? STATUS_LABEL[topic.status] || "Com roteiro"
                      : "Sem roteiro"}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[var(--ink-soft)]">{topic.summary}</p>
              {topic.examples.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-[var(--ink-soft)]">
                  {topic.examples.slice(0, 3).map((ex) => (
                    <li key={ex.id}>“{ex.text}”</li>
                  ))}
                </ul>
              )}
              <TopicActions
                topicId={topic.id}
                hasScript={topic.hasScript}
                status={topic.status}
                initialNotes={topic.userNotes}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
