import { AddManualTopic } from "@/components/AddManualTopic";
import { GenerateTopButton } from "@/components/GenerateTopButton";
import { TopicsBoard } from "@/components/TopicsBoard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const topics = await prisma.topic.findMany({
    where: {
      status: { not: "discarded" },
    },
    include: {
      examples: true,
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ dateBucket: "desc" }, { score: "desc" }, { frequency: "desc" }],
  });

  const cards = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    dateBucket: topic.dateBucket,
    frequency: topic.frequency,
    score: topic.score,
    status: topic.status,
    kind: topic.kind,
    hasScript: topic.scripts.length > 0,
    userNotes: topic.userNotes || "",
    examples: topic.examples.map((ex) => ({ id: ex.id, text: ex.text })),
  }));

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--ink-soft)]">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            Perguntas
          </h2>
          <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
            Perguntas e polêmicos ficam aqui. Só saem quando você descartar.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <AddManualTopic />
          <GenerateTopButton />
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="card p-6 text-[var(--ink-soft)]">
          Nenhuma pergunta ainda. Adicione uma manualmente ou rode o job em{" "}
          <strong>Config</strong>.
        </div>
      ) : (
        <TopicsBoard topics={cards} />
      )}
    </div>
  );
}
