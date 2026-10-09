export type EvolutionMessage = {
  waMessageId: string;
  author: string | null;
  text: string;
  timestamp: Date;
  remoteJid: string;
  fromMe: boolean;
  participant: string | null;
  participantAlt: string | null;
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
  const participantAlt =
    (typeof key.participantAlt === "string" && key.participantAlt) ||
    (typeof key.participantPn === "string" && key.participantPn) ||
    (typeof raw.participantAlt === "string" && raw.participantAlt) ||
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
    participantAlt,
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

const MESSAGE_KIND: Record<string, string> = {
  imageMessage: "Imagem",
  videoMessage: "Vídeo",
  audioMessage: "Áudio",
  stickerMessage: "Figurinha",
  reactionMessage: "Reação",
  albumMessage: "Álbum",
  documentMessage: "Documento",
  protocolMessage: "Mensagem apagada",
  secretEncryptedMessage: "Mensagem criptografada",
};

function messagePreview(raw: Record<string, unknown>): string {
  const text = extractText(raw)?.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 160);
  const message = (raw.message ?? {}) as Record<string, unknown>;
  const kind = Object.keys(message).find(
    (key) => key !== "messageContextInfo" && key !== "senderKeyDistributionMessage",
  );
  return (kind && MESSAGE_KIND[kind]) || "Mensagem sem texto";
}

export type GroupLatestMessage = {
  name: string;
  remoteJid: string;
  active: boolean;
  at: string | null;
  preview: string;
  fromMe: boolean;
  author: string | null;
  error: string | null;
};

export async function fetchLatestGroupMessage(
  input: {
    name: string;
    remoteJid: string;
    active: boolean;
  },
  timeoutMs = 50000,
): Promise<GroupLatestMessage> {
  const base = {
    name: input.name,
    remoteJid: input.remoteJid,
    active: input.active,
    at: null,
    preview: "",
    fromMe: false,
    author: null,
    error: null as string | null,
  };

  try {
    const { baseUrl, apiKey, instance } = getConfig();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          where: { key: { remoteJid: input.remoteJid } },
          page: 1,
          offset: 1,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return { ...base, error: "A Evolution não devolveu as mensagens." };
      }
      const rows = unwrapList(await res.json());
      const raw = rows[0];
      if (!raw) {
        return { ...base, preview: "Nenhuma mensagem encontrada." };
      }
      const when = toDate(raw.messageTimestamp);
      const key = (raw.key ?? {}) as Record<string, unknown>;
      return {
        ...base,
        at: when
          ? when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
          : null,
        preview: messagePreview(raw),
        fromMe: key.fromMe === true,
        author: typeof raw.pushName === "string" ? raw.pushName : null,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...base,
      error: aborted
        ? "A Evolution demorou demais para responder."
        : "Não consegui ler a última mensagem.",
    };
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

function canonicalJid(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+(?=@)/, "");
}

function addJid(ids: Set<string>, value: unknown) {
  if (typeof value !== "string" || !value.includes("@")) return;
  ids.add(canonicalJid(value));
}

const adminCache = new Map<
  string,
  { until: number; ids: Set<string> | null }
>();

function readParticipants(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const direct = root.participants;
  if (Array.isArray(direct)) {
    return direct.filter((item) => item && typeof item === "object") as Record<
      string,
      unknown
    >[];
  }
  const data = root.data;
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).participants;
    if (Array.isArray(nested)) {
      return nested.filter((item) => item && typeof item === "object") as Record<
        string,
        unknown
      >[];
    }
  }
  return [];
}

export async function fetchGroupAdminIds(
  remoteJid: string,
): Promise<Set<string> | null> {
  const cached = adminCache.get(remoteJid);
  if (cached && cached.until > Date.now()) return cached.ids;

  const { baseUrl, apiKey, instance } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(
      `${baseUrl}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(remoteJid)}`,
      { headers: { apikey: apiKey }, signal: controller.signal },
    );
    if (!res.ok) {
      adminCache.set(remoteJid, { until: Date.now() + 60_000, ids: null });
      return null;
    }

    const ids = new Set<string>();
    for (const participant of readParticipants(await res.json())) {
      const role = participant.admin;
      const isAdmin =
        role === "admin" || role === "superadmin" || role === true;
      if (!isAdmin) continue;
      addJid(ids, participant.id);
      addJid(ids, participant.lid);
      addJid(ids, participant.phoneNumber);
      addJid(ids, participant.jid);
    }

    adminCache.set(remoteJid, { until: Date.now() + 10 * 60_000, ids });
    return ids;
  } catch {
    adminCache.set(remoteJid, { until: Date.now() + 60_000, ids: null });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function senderIsGroupAdmin(
  adminIds: Set<string>,
  candidates: Array<string | null | undefined>,
): boolean {
  return candidates.some(
    (value) => typeof value === "string" && adminIds.has(canonicalJid(value)),
  );
}

export type SentMessage = {
  id: string;
  remoteJid: string;
  participant: string | null;
};

export async function sendTextMessage(
  number: string,
  text: string,
): Promise<SentMessage> {
  const { baseUrl, apiKey, instance } = getConfig();
  const destination = number.trim();
  const target = destination.toLowerCase().endsWith("@g.us")
    ? destination
    : destination.replace(/\D/g, "");
  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number: target || destination, text }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Falha ao avisar no WhatsApp: ${body.slice(0, 300)}`);
  }
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    json = {};
  }
  const key = (json.key ?? {}) as Record<string, unknown>;
  const id = typeof key.id === "string" ? key.id : "";
  if (!id) {
    throw new Error("A Evolution enviou, mas não devolveu o identificador da mensagem.");
  }
  const participant =
    (typeof json.participant === "string" && json.participant) ||
    (typeof key.participant === "string" && key.participant) ||
    null;
  return {
    id,
    remoteJid: typeof key.remoteJid === "string" ? key.remoteJid : target || destination,
    participant,
  };
}

async function groupMessagePresence(
  remoteJid: string,
  messageId: string,
): Promise<"visible" | "gone" | "unknown"> {
  const { baseUrl, apiKey, instance } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        where: { key: { remoteJid, id: messageId } },
        page: 1,
        offset: 1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return "unknown";
    const rows = unwrapList(await res.json());
    const raw = rows.find((row) => {
      const key = (row.key ?? {}) as Record<string, unknown>;
      return key.id === messageId;
    });
    if (!raw) return "gone";
    const key = (raw.key ?? {}) as Record<string, unknown>;
    if (key.deleted === true) return "gone";
    const stub = raw.messageStubType;
    if (stub === "REVOKE" || stub === 1) return "gone";
    return "visible";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

function revokeNamesAuthor(body: string, messageId: string): boolean {
  try {
    const json = JSON.parse(body) as {
      message?: {
        protocolMessage?: {
          type?: string | number;
          key?: { id?: string; participant?: string };
        };
      };
    };
    const protocol = json.message?.protocolMessage;
    if (!protocol?.key) return false;
    const type = protocol.type;
    const isRevoke = type === "REVOKE" || type === 0 || type === "0";
    if (!isRevoke) return false;
    if (protocol.key.id && protocol.key.id !== messageId) return false;
    return (
      typeof protocol.key.participant === "string" &&
      protocol.key.participant.includes("@")
    );
  } catch {
    return false;
  }
}

export async function deleteMessageForEveryone(input: {
  id: string;
  remoteJid: string;
  participants: Array<string | null | undefined>;
}): Promise<void> {
  const candidates = [
    ...new Set(
      input.participants.filter(
        (value): value is string =>
          typeof value === "string" && value.includes("@"),
      ),
    ),
  ];
  if (candidates.length === 0) {
    throw new Error(
      "A mensagem chegou sem o autor do grupo, então não dá para apagar para todos.",
    );
  }

  const { baseUrl, apiKey, instance } = getConfig();
  let lastError = "Falha ao apagar a mensagem para todos.";

  for (const participant of candidates) {
    const res = await fetch(
      `${baseUrl}/chat/deleteMessageForEveryone/${instance}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({
          id: input.id,
          remoteJid: input.remoteJid,
          fromMe: false,
          participant,
        }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      lastError = `Falha ao apagar mensagem: ${text.slice(0, 300)}`;
      continue;
    }
    if (!revokeNamesAuthor(text, input.id)) {
      lastError =
        "A Evolution respondeu, mas o pedido não identificou o autor. Sem isso o WhatsApp não apaga para todos.";
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if ((await groupMessagePresence(input.remoteJid, input.id)) !== "gone") {
      lastError =
        "A Evolution aceitou apagar para todos, mas o WhatsApp manteve a mensagem no grupo.";
      continue;
    }
    return;
  }

  throw new Error(lastError);
}

export async function deleteOwnGroupMessage(input: {
  id: string;
  remoteJid: string;
  participant?: string | null;
}): Promise<"gone" | "unconfirmed"> {
  const { baseUrl, apiKey, instance } = getConfig();
  const payload: Record<string, unknown> = {
    id: input.id,
    remoteJid: input.remoteJid,
    fromMe: true,
  };
  if (input.participant) payload.participant = input.participant;
  const res = await fetch(
    `${baseUrl}/chat/deleteMessageForEveryone/${instance}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Falha ao apagar mensagem: ${text.slice(0, 300)}`);
  }
  if (!revokeNamesAuthor(text, input.id) && !revokeMatchesOwnMessage(text, input.id)) {
    throw new Error(
      "A Evolution respondeu, mas o pedido não foi de apagar para todos.",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const presence = await groupMessagePresence(input.remoteJid, input.id);
  if (presence === "visible") {
    throw new Error(
      "A mensagem de teste foi enviada, mas continua no grupo. O WhatsApp não apagou.",
    );
  }
  return presence === "gone" ? "gone" : "unconfirmed";
}

function revokeMatchesOwnMessage(body: string, messageId: string): boolean {
  try {
    const json = JSON.parse(body) as {
      message?: {
        protocolMessage?: {
          type?: string | number;
          key?: { id?: string; fromMe?: boolean };
        };
      };
    };
    const protocol = json.message?.protocolMessage;
    if (!protocol?.key) return false;
    const type = protocol.type;
    const isRevoke = type === "REVOKE" || type === 0 || type === "0";
    return isRevoke && protocol.key.id === messageId && protocol.key.fromMe === true;
  } catch {
    return false;
  }
}

  throw new Error(lastError);
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
  try {
    const res = await fetchEvolution(
      `${baseUrl}/webhook/find/${instance}`,
      apiKey,
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Falha ao ler webhook: ${await res.text()}`);
    }
    return readWebhook(await res.json());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("A Evolution demorou demais para responder.");
    }
    throw err;
  }
}

export async function setWebhook(input: {
  url: string;
  events: string[];
}): Promise<void> {
  const { baseUrl, apiKey, instance } = getConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
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
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Falha ao registrar webhook: ${await res.text()}`);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("A Evolution demorou demais para responder.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type EvolutionHealth = {
  ok: boolean;
  title: string;
  detail: string;
};

async function fetchEvolution(
  url: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function checkEvolutionHealth(
  groupJid?: string | null,
): Promise<EvolutionHealth> {
  try {
    const { baseUrl, apiKey, instance } = getConfig();
    const stateRes = await fetchEvolution(
      `${baseUrl}/instance/connectionState/${instance}`,
      apiKey,
    );
    if (!stateRes.ok) {
      return {
        ok: false,
        title: "Evolution fora",
        detail: "A API da Evolution não respondeu.",
      };
    }

    const stateJson = (await stateRes.json()) as {
      instance?: { state?: string };
    };
    const state = stateJson.instance?.state ?? "desconhecido";
    if (state !== "open") {
      return {
        ok: false,
        title: "Evolution fora",
        detail: `A sessão do WhatsApp está ${state}. Conecte de novo no painel da Evolution.`,
      };
    }

    if (!groupJid) {
      return {
        ok: true,
        title: "Evolution conectada",
        detail: "A sessão está aberta.",
      };
    }

    const infoRes = await fetchEvolution(
      `${baseUrl}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(groupJid)}`,
      apiKey,
    );
    const infoText = await infoRes.text();
    if (!infoRes.ok || /connection closed/i.test(infoText)) {
      return {
        ok: false,
        title: "Evolution fora",
        detail:
          "A sessão aparece aberta, mas não está lendo os grupos. Na VPS, reinicie o serviço evolution_evolution_api.",
      };
    }

    return {
      ok: true,
      title: "Evolution conectada",
      detail: "A sessão está aberta e os grupos estão respondendo.",
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      title: "Evolution fora",
      detail: aborted
        ? "A Evolution demorou demais para responder."
        : "Não consegui falar com a Evolution.",
    };
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
