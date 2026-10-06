import { prisma } from "./db";
import {
  deleteMessageForEveryone,
  fetchGroupMessages,
  findWebhook,
  sendTextMessage,
  setWebhook,
  type EvolutionMessage,
} from "./evolution";

const DEFAULT_DOMAINS = [
  "meli.la",
  "shopee.com.br",
  "amazon.com.br",
  "aliexpress.com",
  "chat.whatsapp.com",
];

const ADMIN_LINK_MS = 72 * 60 * 60 * 1000;

export type IncomingMessage = {
  waMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  participant: string | null;
  pushName: string | null;
  text: string;
  timestamp: Date;
};

export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const urls: string[] = [];
  for (const raw of found) {
    const cleaned = raw.replace(/[),.;!?]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (url.protocol === "http:" || url.protocol === "https:") {
        urls.push(url.toString());
      }
    } catch {
      // ignora trecho que não é URL
    }
  }
  return urls;
}

export function linkKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "chat.whatsapp.com") {
      const code = url.pathname.split("/").filter(Boolean)[0];
      return code ? `chat.whatsapp.com/${code}` : null;
    }
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}${url.search}`;
  } catch {
    return null;
  }
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const blocked = domain.toLowerCase().replace(/^\.+/, "").replace(/^www\./, "");
  return host === blocked || host.endsWith(`.${blocked}`);
}

export async function ensureModerationDefaults() {
  await prisma.moderationSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  for (const domain of DEFAULT_DOMAINS) {
    await prisma.blockedDomain.upsert({
      where: { domain },
      create: { domain },
      update: {},
    });
  }
}

export function parseEvolutionWebhook(body: unknown): IncomingMessage[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const event = String(root.event ?? root.type ?? "").toLowerCase();
  if (event && !event.includes("messages.upsert") && !event.includes("messages_upsert")) {
    return [];
  }

  const data = root.data ?? root;
  const records: unknown[] = [];
  if (Array.isArray(data)) {
    records.push(...data);
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.messages)) records.push(...obj.messages);
    else records.push(obj);
  }

  const parsed: IncomingMessage[] = [];
  for (const item of records) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const key = (raw.key ?? {}) as Record<string, unknown>;
    const waMessageId = typeof key.id === "string" ? key.id : null;
    const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : null;
    if (!waMessageId || !remoteJid || !remoteJid.endsWith("@g.us")) continue;

    const message = (raw.message ?? {}) as Record<string, unknown>;
    const text =
      (typeof message.conversation === "string" && message.conversation) ||
      (typeof (message.extendedTextMessage as { text?: string } | undefined)?.text ===
        "string" &&
        (message.extendedTextMessage as { text: string }).text) ||
      (typeof (message.imageMessage as { caption?: string } | undefined)?.caption ===
        "string" &&
        (message.imageMessage as { caption: string }).caption) ||
      (typeof (message.videoMessage as { caption?: string } | undefined)?.caption ===
        "string" &&
        (message.videoMessage as { caption: string }).caption) ||
      "";
    if (!text.trim()) continue;

    const timestampSeconds = Number(raw.messageTimestamp ?? raw.timestamp ?? Date.now() / 1000);
    const timestamp = new Date(
      timestampSeconds < 1e12 ? timestampSeconds * 1000 : timestampSeconds,
    );

    parsed.push({
      waMessageId,
      remoteJid,
      fromMe: key.fromMe === true,
      participant: typeof key.participant === "string" ? key.participant : null,
      pushName: typeof raw.pushName === "string" ? raw.pushName : null,
      text: text.trim(),
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    });
  }
  return parsed;
}

async function rememberAdminLinks(urls: string[]) {
  const expiresAt = new Date(Date.now() + ADMIN_LINK_MS);
  for (const sample of urls) {
    const urlKey = linkKey(sample);
    if (!urlKey) continue;
    await prisma.adminLink.upsert({
      where: { urlKey },
      create: { urlKey, sample, expiresAt },
      update: { sample, expiresAt },
    });
  }
}

export async function processModerationMessage(message: IncomingMessage) {
  await ensureModerationDefaults();
  await prisma.adminLink.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  const group = await prisma.group.findUnique({
    where: { remoteJid: message.remoteJid },
  });
  if (!group?.active) return { ignored: true as const };

  const urls = extractUrls(message.text);
  if (urls.length === 0) return { ignored: true as const };

  if (message.fromMe) {
    await rememberAdminLinks(urls);
    return { ignored: true as const, adminLinks: urls.length };
  }

  const [settings, domains, whitelist, adminLinks] = await Promise.all([
    prisma.moderationSettings.findUniqueOrThrow({ where: { id: "default" } }),
    prisma.blockedDomain.findMany(),
    prisma.whitelistLink.findMany(),
    prisma.adminLink.findMany({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  if (!settings.enabled) return { ignored: true as const };

  const allowed = new Set([
    ...adminLinks.map((link) => link.urlKey),
    ...whitelist.map((link) => linkKey(link.url)).filter((key): key is string => !!key),
  ]);

  const matched = urls.filter((sample) => {
    const key = linkKey(sample);
    if (key && allowed.has(key)) return false;
    let hostname = "";
    try {
      hostname = new URL(sample).hostname;
    } catch {
      return false;
    }
    return domains.some((domain) => hostMatchesDomain(hostname, domain.domain));
  });

  if (matched.length === 0) return { ignored: true as const };

  const author =
    message.pushName && message.participant
      ? `${message.pushName} (${message.participant})`
      : message.pushName || message.participant || "desconhecido";

  try {
    await prisma.moderationEvent.create({
      data: {
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
        groupName: group.name,
        author,
        text: message.text,
        matchedUrl: matched.join("\n"),
        action: "pending",
        messageAt: message.timestamp,
      },
    });
  } catch {
    return { ignored: true as const, duplicate: true };
  }

  let action = "notified";
  let detail: string | null = null;

  if (settings.notifyNumber.trim()) {
    const when = message.timestamp.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const mode = settings.deleteMode
      ? "Modo: avisar e apagar."
      : "Modo: só aviso. A mensagem não foi apagada.";
    try {
      await sendTextMessage(
        settings.notifyNumber,
        [
          `Link bloqueado em ${group.name}`,
          `Quem: ${author}`,
          `Quando: ${when}`,
          `Link: ${matched.join(", ")}`,
          "",
          message.text,
          "",
          mode,
        ].join("\n"),
      );
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
      action = "notify_failed";
    }
  } else {
    detail = "Número de aviso não configurado";
    action = "notify_failed";
  }

  if (settings.deleteMode) {
    try {
      await deleteMessageForEveryone({
        id: message.waMessageId,
        remoteJid: message.remoteJid,
        participant: message.participant,
      });
      action = action === "notify_failed" ? "deleted_notify_failed" : "deleted";
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      detail = detail ? `${detail} | ${reason}` : reason;
      if (action === "notified") action = "delete_failed";
    }
  }

  await prisma.moderationEvent.update({
    where: {
      groupJid_waMessageId: {
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
      },
    },
    data: { action, detail },
  });

  return { ignored: false as const, action };
}

export async function scanRecentMessages(minutes = 30) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const groups = await prisma.group.findMany({ where: { active: true } });
  let checked = 0;
  let flagged = 0;

  for (const group of groups) {
    const messages = await fetchGroupMessages({
      remoteJid: group.remoteJid,
      since,
      maxPages: 2,
    });
    for (const message of messages) {
      checked += 1;
      const result = await processModerationMessage(toIncoming(message));
      if (!result.ignored) flagged += 1;
    }
  }

  return { checked, flagged };
}

function toIncoming(message: EvolutionMessage): IncomingMessage {
  return {
    waMessageId: message.waMessageId,
    remoteJid: message.remoteJid,
    fromMe: message.fromMe,
    participant: message.participant,
    pushName: message.pushName,
    text: message.text,
    timestamp: message.timestamp,
  };
}

export async function registerModerationWebhook(targetUrl: string) {
  const current = await findWebhook();
  const events = new Set(current?.events ?? []);
  events.add("MESSAGES_UPSERT");

  if (current?.url && current.url !== targetUrl) {
    return {
      registered: false,
      message: `A Evolution já aponta para ${current.url}. Não substituí, para não derrubar outra automação. Inclua MESSAGES_UPSERT nessa URL ou aponte manualmente para ${targetUrl}.`,
      url: current.url,
    };
  }

  await setWebhook({ url: targetUrl, events: [...events] });
  return {
    registered: true,
    message: "Webhook da Evolution apontando para a moderação.",
    url: targetUrl,
  };
}
