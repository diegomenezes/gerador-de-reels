import { IdeasBoard } from "@/components/IdeasBoard";
import { PageHeader } from "@/components/PageHeader";
import { RunSourceButton } from "@/components/RunSourceButton";
import { lastJob, loadIdeas } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function YoutubePage() {
  const [ideas, job] = await Promise.all([loadIdeas(["youtube"]), lastJob(["youtube"])]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fonte · YouTube"
        title="Vídeos longos"
        description="Ideias para o canal do YouTube a partir dos vídeos longos mais vistos de impressão 3D. Só busca quando você mandar."
        actions={
          <RunSourceButton mode="youtube" label="Buscar ideias para YouTube" lastJob={job} />
        }
      />
      <IdeasBoard
        ideas={ideas}
        emptyText="Nenhuma ideia de vídeo longo ainda. Toque em “Buscar ideias para YouTube”."
      />
    </div>
  );
}
