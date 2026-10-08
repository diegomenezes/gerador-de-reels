import { headers } from "next/headers";
import { ModerationPanel } from "@/components/ModerationPanel";
import { prisma } from "@/lib/db";
import { checkEvolutionHealth } from "@/lib/evolution";
import {
  ensureModerationDefaults,
  registerModerationWebhook,
} from "@/lib/moderation";

export const dynamic = "force-dynamic";

export default async function ModeracaoPage() {
  await ensureModerationDefaults();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "";
  const proto = headerList.get("x-forwarded-proto") || "https";
  const webhookUrl = host ? `${proto}://${host}/api/moderation/webhook` : "";

  let webhookMessage = "Abra a página na VPS para registrar o webhook.";
  if (webhookUrl) {
    try {
      const result = await registerModerationWebhook(webhookUrl);
      webhookMessage = result.message;
    } catch (err) {
      webhookMessage = err instanceof Error ? err.message : String(err);
    }
  }

  const [settings, domains, whitelist, events, evolution] = await Promise.all([
    prisma.moderationSettings.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.blockedDomain.findMany({ orderBy: { domain: "asc" } }),
    prisma.whitelistLink.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.moderationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.group
      .findFirst({ where: { active: true }, select: { remoteJid: true } })
      .then((group) => checkEvolutionHealth(group?.remoteJid)),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-3xl font-semibold tracking-tight">Moderação</h2>
        <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
          Links de loja e convite nos grupos cadastrados. O aviso sai na hora
          em que a mensagem chega. Links que você mesmo enviou ficam liberados
          por 72 horas.
        </p>
      </section>
      <ModerationPanel
        enabled={settings.enabled}
        deleteMode={settings.deleteMode}
        notifyNumber={settings.notifyNumber}
        domains={domains}
        whitelist={whitelist}
        events={events.map((event) => ({
          id: event.id,
          groupName: event.groupName,
          author: event.author,
          text: event.text,
          matchedUrl: event.matchedUrl,
          action: event.action,
          detail: event.detail,
          messageAt: event.messageAt.toISOString(),
        }))}
        webhookMessage={webhookMessage}
        webhookUrl={webhookUrl}
        evolution={evolution}
      />
    </div>
  );
}
