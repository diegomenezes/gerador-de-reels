import Link from "next/link";
import { IdeasBoard } from "@/components/IdeasBoard";
import { PageHeader } from "@/components/PageHeader";
import { RunSourceButton } from "@/components/RunSourceButton";
import { apifyConfigured } from "@/lib/apify";
import { lastJob, loadIdeas } from "@/lib/ideas";

export const dynamic = "force-dynamic";

export default async function TendenciasPage() {
  const [ideas, job] = await Promise.all([loadIdeas(["viral"]), lastJob(["viral", "daily"])]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fonte · TikTok, Reels e Shorts"
        title="Tendências"
        description={
          <>
            Vídeos curtos de impressão 3D que estão indo bem, em português, inglês e espanhol,
            viraram ideias para você gravar.{" "}
            <Link href="/ajustes#tendencias" className="text-[var(--accent)] underline-offset-2 hover:underline">
              Redes e termos
            </Link>
          </>
        }
        actions={
          <RunSourceButton
            mode="viral"
            label="Buscar tendências agora"
            lastJob={job}
            hint={apifyConfigured() ? undefined : "Falta configurar o APIFY_TOKEN no servidor."}
          />
        }
      />
      <IdeasBoard
        ideas={ideas}
        emptyText="Nenhuma tendência ainda. Toque em “Buscar tendências agora”."
      />
    </div>
  );
}
