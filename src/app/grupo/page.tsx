import { AddManualTopic } from "@/components/AddManualTopic";
import { GenerateTopButton } from "@/components/GenerateTopButton";
import { IdeasBoard } from "@/components/IdeasBoard";
import { PageHeader } from "@/components/PageHeader";
import { RunSourceButton } from "@/components/RunSourceButton";
import { lastJob, loadIdeas } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function GrupoPage() {
  const [ideas, job] = await Promise.all([
    loadIdeas(["question", "polemic"]),
    lastJob(["group", "daily"]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fonte · WhatsApp"
        title="Ideias do grupo"
        description="Dúvidas e polêmicas que apareceram no grupo nas últimas 24 horas."
        actions={
          <RunSourceButton
            mode="group"
            label="Ler o grupo agora"
            lastJob={job}
          />
        }
      />

      <div className="flex flex-wrap items-start gap-3">
        <AddManualTopic />
        <GenerateTopButton />
      </div>

      <IdeasBoard
        ideas={ideas}
        tabs={[
          { id: "question", label: "Perguntas" },
          { id: "polemic", label: "Polêmicos" },
        ]}
        emptyText="Nenhuma ideia do grupo ainda. Toque em “Ler o grupo agora”."
      />
    </div>
  );
}
