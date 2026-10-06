import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { registerModerationWebhook } from "@/lib/moderation";

function publicWebhookUrl(host: string, proto: string) {
  return `${proto}://${host}/api/moderation/webhook`;
}

export async function POST() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || "https";
  if (!host) {
    return NextResponse.json({ error: "Host não identificado" }, { status: 400 });
  }

  try {
    const result = await registerModerationWebhook(publicWebhookUrl(host, proto));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
