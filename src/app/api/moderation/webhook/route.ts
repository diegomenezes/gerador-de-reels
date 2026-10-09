import { after, NextResponse } from "next/server";
import {
  parseEvolutionWebhook,
  processModerationMessage,
  rememberGroupMessage,
} from "@/lib/moderation";

function authorized(request: Request): boolean {
  const cron = process.env.CRON_SECRET;
  const evolutionKey = process.env.EVOLUTION_API_KEY;
  const header = request.headers.get("authorization");
  const apikey = request.headers.get("apikey");
  if (cron && header === `Bearer ${cron}`) return true;
  if (evolutionKey && apikey === evolutionKey) return true;
  return false;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const messages = parseEvolutionWebhook(body);
  after(async () => {
    for (const message of messages) {
      try {
        await rememberGroupMessage(message);
      } catch (err) {
        console.error("[moderacao] gravar mensagem:", err);
      }
      try {
        await processModerationMessage(message);
      } catch (err) {
        console.error("[moderacao] processar mensagem:", err);
      }
    }
  });
  return NextResponse.json({ ok: true, count: messages.length });
}
