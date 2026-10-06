export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const base = process.env.APP_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return;

  const { registerModerationWebhook } = await import("./lib/moderation");
  try {
    const result = await registerModerationWebhook(
      `${base}/api/moderation/webhook`,
    );
    console.log(`[moderacao] ${result.message}`);
  } catch (err) {
    console.error(
      "[moderacao] webhook:",
      err instanceof Error ? err.message : err,
    );
  }
}
