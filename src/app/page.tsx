import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/viral";

export const dynamic = "force-dynamic";

const SOURCES = [
  {
    href: "/grupo",
    title: "Grupo",
    detail: "Dúvidas e polêmicas do WhatsApp",
    kinds: ["question", "polemic"] as const,
    setting: "groupSource" as const,
  },
  {
    href: "/tendencias",
    title: "Tendências",
    detail: "Virais do TikTok, Reels e Shorts",
    kinds: ["viral"] as const,
    setting: "viralSource" as const,
  },
  {
    href: "/youtube",
    title: "YouTube",
    detail: "Ideias para vídeos longos",
    kinds: ["youtube"] as const,
    setting: null,
  },
];

export default async function HomePage() {
  const [settings, newCounts, pendingScripts, recorded, lastAuto] = await Promise.all([
    getSettings(),
    Promise.all(
      SOURCES.map((s) =>
        prisma.topic.count({
          where: { kind: { in: [...s.kinds] }, status: "new", scripts: { none: {} } },
        }),
      ),
    ),
    prisma.topic.count({ where: { status: "scripted" } }),
    prisma.topic.count({ where: { status: "recorded" } }),
    prisma.jobRun.findFirst({ where: { mode: "daily" }, orderBy: { startedAt: "desc" } }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-[var(--ink-soft)]">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">O que gravar hoje</h2>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Ideias novas, sem roteiro
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          {SOURCES.map((source, i) => {
            const auto = source.setting ? settings[source.setting] : false;
            return (
              <Link
                key={source.href}
                href={source.href}
                className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">{source.title}</span>
                  <span className="text-sm text-[var(--accent)]">Abrir →</span>
                </div>
                <span className="text-4xl font-semibold">{newCounts[i]}</span>
                <span className="text-sm text-[var(--ink-soft)]">{source.detail}</span>
                <span className="text-xs text-[var(--ink-soft)]">
                  {source.setting
                    ? auto
                      ? "Busca sozinha todo dia às 6h"
                      : "Só pelo botão (automático desligado)"
                    : "Só pelo botão"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
          Produção
        </h3>
        <Link
          href="/roteiros"
          className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:-translate-y-0.5"
        >
          <div className="flex gap-8">
            <div>
              <p className="text-3xl font-semibold">{pendingScripts}</p>
              <p className="text-sm text-[var(--ink-soft)]">roteiros para gravar</p>
            </div>
            <div>
              <p className="text-3xl font-semibold">{recorded}</p>
              <p className="text-sm text-[var(--ink-soft)]">já gravados</p>
            </div>
          </div>
          <span className="text-sm text-[var(--accent)]">Ver roteiros →</span>
        </Link>
      </section>

      {lastAuto && (
        <p className="text-sm text-[var(--ink-soft)]">
          Última busca automática:{" "}
          {lastAuto.startedAt.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          ·{" "}
          {lastAuto.running
            ? "rodando agora"
            : lastAuto.success
              ? `${lastAuto.topicsCreated} ideia(s) nova(s)`
              : "falhou"}
          {!lastAuto.running && lastAuto.error && (
            <span className="text-[var(--warn)]"> · {lastAuto.error.slice(0, 160)}</span>
          )}{" "}
          ·{" "}
          <Link href="/ajustes#sistema" className="text-[var(--accent)] underline-offset-2 hover:underline">
            detalhes
          </Link>
        </p>
      )}
    </div>
  );
}
