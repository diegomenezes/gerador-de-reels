export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { disableFullHistorySync } = await import("./lib/evolution");
  try {
    await disableFullHistorySync();
    console.log("[moderacao] a Evolution não baixa o histórico completo ao reconectar.");
  } catch (err) {
    console.error(
      "[moderacao] histórico:",
      err instanceof Error ? err.message : err,
    );
  }

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
