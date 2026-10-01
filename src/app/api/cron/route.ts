import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/pipeline";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDailyPipeline();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
