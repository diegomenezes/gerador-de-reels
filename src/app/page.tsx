import { format } from "date-fns";
import { AddManualTopic } from "@/components/AddManualTopic";
import { GenerateTopButton } from "@/components/GenerateTopButton";
import { TopicsBoard } from "@/components/TopicsBoard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dateBucket = format(new Date(), "yyyy-MM-dd");
  const topics = await prisma.topic.findMany({
    where: {
      dateBucket,
      status: { not: "discarded" },
    },
    include: {
      examples: true,
      scripts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ score: "desc" }, { frequency: "desc" }],
  });

  const cards = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    frequency: topic.frequency,
    score: topic.score,
    status: topic.status,
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
            Agrupadas a partir dos grupos do WhatsApp. Gere o roteiro e vá
            gravando.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <AddManualTopic />
          <GenerateTopButton />
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="card p-6 text-[var(--ink-soft)]">
          Nenhuma dúvida processada hoje. Adicione uma pergunta manualmente ou
          rode o job em <strong>Config</strong>.
        </div>
      ) : (
        <TopicsBoard topics={cards} />
      )}
    </div>
  );
}
