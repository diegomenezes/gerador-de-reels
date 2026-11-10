// Cliente mínimo da API do Apify: inicia um ator, espera terminar e lê os resultados.

const API = "https://api.apify.com/v2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
const MAX_WAIT_MS = 10 * 60_000;

function token(): string {
  const value = process.env.APIFY_TOKEN?.trim();
  if (!value) throw new Error("Configure APIFY_TOKEN no .env para buscar vídeos virais");
  return value;
}

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

async function api(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${API}${path}${sep}token=${encodeURIComponent(token())}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // resposta sem JSON
  }
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message || text.slice(0, 200);
    throw new Error(`Apify ${res.status}: ${message}`);
  }
  return json;
}

/**
 * Roda um ator do Apify e devolve os itens do dataset.
 * maxItems e maxTotalChargeUsd limitam o gasto de cada execução.
 */
export async function runActor(
  actorId: string,
  input: Record<string, unknown>,
  limits: { maxItems: number; maxTotalChargeUsd: number },
): Promise<Record<string, unknown>[]> {
  const started = (await api(
    `/acts/${actorId.replace("/", "~")}/runs?maxItems=${limits.maxItems}&maxTotalChargeUsd=${limits.maxTotalChargeUsd}`,
    { method: "POST", body: JSON.stringify(input) },
  )) as { data: { id: string; status: string; defaultDatasetId: string } };

  let run = started.data;
  const deadline = Date.now() + MAX_WAIT_MS;
  while (!TERMINAL.has(run.status)) {
    if (Date.now() > deadline) {
      await api(`/actor-runs/${run.id}/abort`, { method: "POST" }).catch(() => null);
      throw new Error(`${actorId}: demorou mais de 10 minutos`);
    }
    const polled = (await api(`/actor-runs/${run.id}?waitForFinish=60`)) as {
      data: typeof run;
    };
    run = polled.data;
  }
  // TIMED-OUT/ABORTED ainda podem ter itens úteis; só FAILED sem itens é erro
  const items = (await api(
    `/datasets/${run.defaultDatasetId}/items?clean=true&format=json`,
  )) as Record<string, unknown>[];
  if (run.status === "FAILED" && (!Array.isArray(items) || items.length === 0)) {
    throw new Error(`${actorId}: execução falhou no Apify`);
  }
  return Array.isArray(items) ? items : [];
}
