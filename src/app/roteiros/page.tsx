import { Suspense } from "react";
import { ScriptsBoard } from "@/components/ScriptsBoard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const scripts = await prisma.script.findMany({
    include: {
      topic: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const cards = scripts.map((script) => {
    let hooks: string[] = [];
    try {
      hooks = JSON.parse(script.hooks || "[]") as string[];
      if (!Array.isArray(hooks)) hooks = [];
    } catch {
      hooks = [];
    }

    return {
      id: script.id,
      topicId: script.topicId,
      content: script.content,
      hooks,
      selectedHook: script.selectedHook,
      caption: script.caption,
      model: script.model,
      createdAt: script.createdAt.toISOString(),
      title: script.topic.title,
      status: script.topic.status,
      userNotes: script.topic.userNotes || "",
    };
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Roteiros</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          Copie, grave e marque como gravado.
        </p>
      </section>

      <Suspense fallback={<div className="card p-6">Carregando roteiros...</div>}>
        <ScriptsBoard scripts={cards} />
      </Suspense>
    </div>
  );
}
