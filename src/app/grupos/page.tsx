import { GroupsManager } from "@/components/GroupsManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Grupos</h2>
        <p className="mt-2 text-[var(--ink-soft)]">
          Cadastre os remoteJids dos grupos monitorados na Evolution API.
        </p>
      </section>
      <GroupsManager initialGroups={groups} />
    </div>
  );
}
