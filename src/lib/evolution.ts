export type EvolutionMessage = {
  waMessageId: string;
  author: string | null;
  text: string;
  timestamp: Date;
  remoteJid: string;
  fromMe: boolean;
  participant: string | null;
  pushName: string | null;
};

type FetchOptions = {
  remoteJid: string;
  since: Date;
  maxPages?: number;
};

function getConfig() {
  const baseUrl = process.env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      "Configure EVOLUTION_BASE_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE",
    );
  }

  return { baseUrl, apiKey, instance };
}

function extractText(message: Record<string, unknown>): string | null {
  const msg = (message.message ?? message) as Record<string, unknown> | undefined;
  if (!msg || typeof msg !== "object") return null;

  if (typeof msg.conversation === "string" && msg.conversation.trim()) {
    return msg.conversation.trim();
  }

  const extended = msg.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text?.trim()) return extended.text.trim();

  const image = msg.imageMessage as { caption?: string } | undefined;
  if (image?.caption?.trim()) return image.caption.trim();

  const video = msg.videoMessage as { caption?: string } | undefined;
  if (video?.caption?.trim()) return video.caption.trim();

  return null;
}

function toDate(value: unknown): Date | null {
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n)) return toDate(n);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeRecord(
  raw: Record<string, unknown>,
  fallbackJid: string,
): EvolutionMessage | null {
  const key = (raw.key ?? {}) as Record<string, unknown>;
  const waMessageId =
    (typeof key.id === "string" && key.id) ||
    (typeof raw.id === "string" && raw.id) ||
    null;
  if (!waMessageId) return null;

  const text = extractText(raw);
  if (!text) return null;

  const timestamp =
    toDate(raw.messageTimestamp) ??
    toDate(raw.timestamp) ??
    toDate(
      (raw.message as Record<string, unknown> | undefined)?.messageTimestamp,
    ) ??
    null;
  if (!timestamp) return null;

  const remoteJid =
    (typeof key.remoteJid === "string" && key.remoteJid) ||
    (typeof raw.remoteJid === "string" && raw.remoteJid) ||
    fallbackJid;

  const participant =
    (typeof key.participant === "string" && key.participant) ||
    (typeof raw.participant === "string" && raw.participant) ||
    null;
  const pushName =
    (typeof raw.pushName === "string" && raw.pushName) ||
    (typeof key.pushName === "string" && key.pushName) ||
    null;
  const author = participant || pushName;
  const fromMe = key.fromMe === true || raw.fromMe === true;

  return {
    waMessageId,
    author,
    text,
    timestamp,
    remoteJid,
    fromMe,
    participant,
    pushName,
  };
}

function unwrapList(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((x) => x && typeof x === "object") as Record<
      string,
      unknown
    >[];
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["messages", "records", "data", "result"]) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((x) => x && typeof x === "object") as Record<
          string,
          unknown
        >[];
      }
      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        if (Array.isArray(nested.records)) {
          return nested.records.filter(
            (x) => x && typeof x === "object",
          ) as Record<string, unknown>[];
        }
        if (Array.isArray(nested.messages)) {
          return nested.messages.filter(
            (x) => x && typeof x === "object",
          ) as Record<string, unknown>[];
        }
      }
    }
  }
  return [];
}

async function postFindMessages(
  remoteJid: string,
  page: number,
): Promise<Record<string, unknown>[]> {
  const { baseUrl, apiKey, instance } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        where: { key: { remoteJid } },
        page,
        offset: 50,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Evolution API ${res.status}: ${await res.text()}`);
    }

    return unwrapList(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGroupMessages({
  remoteJid,
  since,
  maxPages = 4,
}: FetchOptions): Promise<EvolutionMessage[]> {
  const collected: EvolutionMessage[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    let batch: Record<string, unknown>[] = [];
    try {
      batch = await postFindMessages(remoteJid, page);
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    if (batch.length === 0) break;

    let olderThanWindow = 0;
    let parsed = 0;

    for (const raw of batch) {
      const msg = normalizeRecord(raw, remoteJid);
      if (!msg) continue;
      parsed += 1;
      if (msg.timestamp < since) {
        olderThanWindow += 1;
        continue;
      }
      if (seen.has(msg.waMessageId)) continue;
      seen.add(msg.waMessageId);
      collected.push(msg);
    }

    if (parsed > 0 && olderThanWindow >= parsed) break;
    if (batch.length < 50) break;
  }

  return collected.sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
}

export async function sendTextMessage(
  number: string,
  text: string,
): Promise<void> {
  const { baseUrl, apiKey, instance } = getConfig();
  const digits = number.replace(/\D/g, "");
  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number: digits || number, text }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao avisar no WhatsApp: ${await res.text()}`);
  }
}

export async function deleteMessageForEveryone(input: {
  id: string;
  remoteJid: string;
  participant: string | null;
}): Promise<void> {
  const { baseUrl, apiKey, instance } = getConfig();
  const res = await fetch(
    `${baseUrl}/chat/deleteMessageForEveryone/${instance}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        id: input.id,
        remoteJid: input.remoteJid,
        fromMe: false,
        participant: input.participant,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Falha ao apagar mensagem: ${await res.text()}`);
  }
}

export type EvolutionWebhook = {
  enabled: boolean;
  url: string;
  events: string[];
};

function readWebhook(payload: unknown): EvolutionWebhook {
  const root =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const nested =
    root.webhook && typeof root.webhook === "object"
      ? (root.webhook as Record<string, unknown>)
      : root;
  const events = Array.isArray(nested.events)
    ? nested.events.filter((e): e is string => typeof e === "string")
    : [];
  return {
    enabled: nested.enabled !== false,
    url: typeof nested.url === "string" ? nested.url : "",
    events,
  };
}

export async function findWebhook(): Promise<EvolutionWebhook | null> {
  const { baseUrl, apiKey, instance } = getConfig();
  const res = await fetch(`${baseUrl}/webhook/find/${instance}`, {
    headers: { apikey: apiKey },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Falha ao ler webhook: ${await res.text()}`);
  }
  return readWebhook(await res.json());
}

export async function setWebhook(input: {
  url: string;
  events: string[];
}): Promise<void> {
  const { baseUrl, apiKey, instance } = getConfig();
  const res = await fetch(`${baseUrl}/webhook/set/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: input.url,
        headers: { apikey: apiKey },
        webhookByEvents: false,
        webhookBase64: false,
        events: input.events,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha ao registrar webhook: ${await res.text()}`);
  }
}

export async function testEvolutionConnection(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const { baseUrl, apiKey, instance } = getConfig();
    const res = await fetch(`${baseUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, detail: text.slice(0, 300) };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
