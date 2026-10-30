import { prisma } from "./db";
import {
  deleteMessageForEveryone,
  fetchGroupAdminIds,
  fetchGroupMessages,
  findWebhook,
  phoneForSender,
  senderIsGroupAdmin,
  sendTextMessage,
  setWebhook,
  type EvolutionMessage,
  type GroupLatestMessage,
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
  participantAlt: string | null;
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

const TRACKING_PARAMS = new Set([
  "tracking_id",
  "sid",
  "position",
  "type",
  "be_origin",
  "overlay_label",
  "search_layout",
  "polycard_client",
  "matt_tool",
  "matt_word",
  "reco_id",
  "c_id",
  "c_uid",
  "attributes",
  "quantity",
  "pdp_filters",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "spm",
  "scm",
]);

export function linkKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "chat.whatsapp.com") {
      const code = url.pathname.split("/").filter(Boolean)[0];
      return code ? `chat.whatsapp.com/${code}` : null;
    }
    const path = url.pathname.replace(/\/+$/, "");
    const params = [...url.searchParams.entries()]
      .filter(([name]) => !TRACKING_PARAMS.has(name.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    const search = params.length
      ? `?${params.map(([key, value]) => `${key}=${value}`).join("&")}`
      : "";
    return `${host}${path}${search}`;
  } catch {
    return null;
  }
}

export function toGroupJid(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = (
    trimmed.toLowerCase().endsWith("@g.us")
      ? trimmed.slice(0, -"@g.us".length)
      : trimmed.includes("@")
        ? ""
        : trimmed
  ).replace(/\D/g, "");
  if (!/^\d{15,24}$/.test(digits)) return null;
  return `${digits}@g.us`;
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const blocked = domain.toLowerCase().replace(/^\.+/, "").replace(/^www\./, "");
  return host === blocked || host.endsWith(`.${blocked}`);
}

const TWO_PART_SUFFIXES = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "art.br",
  "blog.br",
  "app.br",
  "com.ar",
  "com.mx",
  "com.au",
  "co.uk",
  "co.jp",
]);

// pt.aliexpress.com -> aliexpress.com, loja.exemplo.com.br -> exemplo.com.br
export function baseDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (/^\d+(\.\d+){3}$/.test(host)) return host;
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return parts.slice(TWO_PART_SUFFIXES.has(lastTwo) ? -3 : -2).join(".");
}

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
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

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
];

// Grupo com mensagens temporárias manda o texto dentro de ephemeralMessage.message.
function unwrapMessage(value: unknown): Record<string, unknown> {
  let message = (value ?? {}) as Record<string, unknown>;
  for (let depth = 0; depth < 3; depth += 1) {
    const wrapper = WRAPPERS.find(
      (name) => (message[name] as { message?: unknown } | undefined)?.message,
    );
    if (!wrapper) break;
    message = (message[wrapper] as { message: Record<string, unknown> }).message;
  }
  return message;
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

    const message = unwrapMessage(raw.message);
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
      (typeof (message.documentMessage as { caption?: string } | undefined)?.caption ===
        "string" &&
        (message.documentMessage as { caption: string }).caption) ||
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
      participantAlt:
        (typeof key.participantAlt === "string" && key.participantAlt) ||
        (typeof key.participantPn === "string" && key.participantPn) ||
        (typeof key.senderPn === "string" && key.senderPn) ||
        (typeof raw.participantAlt === "string" && raw.participantAlt) ||
        (typeof raw.participantPn === "string" && raw.participantPn) ||
        (typeof raw.senderPn === "string" && raw.senderPn) ||
        null,
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

const PHONE_IN_AUTHOR = /\(\+(\d{10,15})\)\s*$/;

export type BlockedSenderRank = {
  name: string;
  phone: string | null;
  count: number;
};

export function blockedSenderRanks(
  events: Array<{
    author: string;
    authorName?: string | null;
    authorPhone?: string | null;
  }>,
): BlockedSenderRank[] {
  const grouped = new Map<string, BlockedSenderRank>();
  for (const event of events) {
    const parsedPhone = event.author.match(PHONE_IN_AUTHOR)?.[1] ?? null;
    const phone = event.authorPhone?.trim() || parsedPhone;
    const name =
      event.authorName?.trim() ||
      event.author.replace(/\s*\([^)]*\)\s*$/, "").trim() ||
      "Sem nome";
    const key = phone || `nome:${name.toLowerCase()}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { name, phone: phone || null, count: 1 });
      continue;
    }
    current.count += 1;
    if (
      (current.name === "Sem nome" || current.name === "desconhecido") &&
      name !== "desconhecido"
    ) {
      current.name = name;
    }
  }
  return [...grouped.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
  );
}

export async function rememberGroupMessage(message: IncomingMessage) {
  const group = await prisma.group.findUnique({
    where: { remoteJid: message.remoteJid },
  });
  if (!group) return;

  const author = message.participant || message.pushName;
  await prisma.message.upsert({
    where: {
      groupId_waMessageId: {
        groupId: group.id,
        waMessageId: message.waMessageId,
      },
    },
    create: {
      groupId: group.id,
      waMessageId: message.waMessageId,
      author,
      text: message.text,
      timestamp: message.timestamp,
    },
    update: {
      author,
      text: message.text,
      timestamp: message.timestamp,
    },
  });
}

export async function latestStoredGroupMessage(input: {
  name: string;
  remoteJid: string;
  active: boolean;
  groupId: string;
}): Promise<GroupLatestMessage> {
  const latest = await prisma.message.findFirst({
    where: { groupId: input.groupId },
    orderBy: { timestamp: "desc" },
  });
  const text = latest?.text.replace(/\s+/g, " ").trim() ?? "";
  return {
    name: input.name,
    remoteJid: input.remoteJid,
    active: input.active,
    at: latest
      ? latest.timestamp.toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : null,
    preview: text ? text.slice(0, 160) : "Nenhuma mensagem encontrada.",
    fromMe: false,
    author: latest?.author ?? null,
    error: null,
  };
}

const RETRY_DELAYS_MIN = [1, 2, 5, 10, 30, 60, 120, 240];
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const STUCK_PENDING_MS = 3 * 60 * 1000;

function nextAttemptAfter(attempts: number): Date | null {
  const minutes = RETRY_DELAYS_MIN[attempts - 1];
  return minutes ? new Date(Date.now() + minutes * 60_000) : null;
}

function formatWhen(date: Date): string {
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function notifyAlertGroup(
  notifyNumber: string,
  lines: string[],
): Promise<string | null> {
  const notifyGroup = toGroupJid(notifyNumber);
  if (!notifyGroup) {
    return notifyGroup === ""
      ? "Grupo de aviso não configurado"
      : "ID do grupo de aviso inválido";
  }
  try {
    await sendTextMessage(notifyGroup, lines.join("\n"));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function announceDeletion(
  announceText: string,
  groupJid: string,
  phone: string | null,
): Promise<string | null> {
  const announcement = announceText.trim();
  if (!announcement) return "Mensagem de moderação vazia.";
  try {
    const mention = phone ? `@${phone}` : "";
    await sendTextMessage(
      groupJid,
      mention ? `${announcement}\n\n${mention}` : announcement,
      {
        delay: 1500,
        mentioned: phone ? [phone] : undefined,
      },
    );
    return null;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return `Não consegui avisar no grupo: ${reason}`;
  }
}

// Guarda o domínio estranho no painel. Devolve só os links de domínios que
// ainda não estavam na lista, para o grupo de aviso receber um alerta por domínio.
async function recordUnknownLinks(
  urls: string[],
  context: { groupName: string; author: string; message: IncomingMessage },
): Promise<string[]> {
  const byDomain = new Map<string, string>();
  for (const sample of urls) {
    const hostname = hostnameOf(sample);
    if (!hostname) continue;
    const domain = baseDomain(hostname);
    if (!byDomain.has(domain)) byDomain.set(domain, sample);
  }

  const fresh: string[] = [];
  for (const [domain, sample] of byDomain) {
    const details = {
      sample,
      groupName: context.groupName,
      author: context.author,
      text: context.message.text,
      lastMessageId: context.message.waMessageId,
      lastSeenAt: context.message.timestamp,
    };
    const existing = await prisma.unknownLink.findUnique({ where: { domain } });
    if (existing) {
      if (existing.lastMessageId !== context.message.waMessageId) {
        await prisma.unknownLink.update({
          where: { domain },
          data: { ...details, count: { increment: 1 } },
        });
      }
      continue;
    }
    try {
      await prisma.unknownLink.create({
        data: { domain, ...details, firstSeenAt: context.message.timestamp },
      });
      fresh.push(sample);
    } catch {
      // outra mensagem criou o mesmo domínio ao mesmo tempo
    }
  }
  return fresh;
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

  const adminIds = await fetchGroupAdminIds(message.remoteJid);
  if (
    adminIds &&
    senderIsGroupAdmin(adminIds, [message.participant, message.participantAlt])
  ) {
    await rememberAdminLinks(urls);
    return { ignored: true as const, adminLinks: urls.length };
  }

  const [settings, domains, allowedDomains, whitelist, adminLinks] =
    await Promise.all([
      prisma.moderationSettings.findUniqueOrThrow({ where: { id: "default" } }),
      prisma.blockedDomain.findMany(),
      prisma.allowedDomain.findMany(),
      prisma.whitelistLink.findMany(),
      prisma.adminLink.findMany({ where: { expiresAt: { gt: new Date() } } }),
    ]);

  if (!settings.enabled) return { ignored: true as const };

  const allowed = new Set([
    ...adminLinks.map((link) => link.urlKey),
    ...whitelist.map((link) => linkKey(link.url)).filter((key): key is string => !!key),
  ]);

  const matched: string[] = [];
  const unknown: string[] = [];
  for (const sample of urls) {
    const key = linkKey(sample);
    if (key && allowed.has(key)) continue;
    const hostname = hostnameOf(sample);
    if (!hostname) continue;
    if (domains.some((domain) => hostMatchesDomain(hostname, domain.domain))) {
      matched.push(sample);
    } else if (
      !allowedDomains.some((domain) => hostMatchesDomain(hostname, domain.domain))
    ) {
      unknown.push(sample);
    }
  }

  if (matched.length === 0 && unknown.length === 0) {
    return { ignored: true as const };
  }

  const phone = phoneForSender(message.remoteJid, [
    message.participantAlt,
    message.participant,
  ]);
  const name = message.pushName?.trim() || "";
  const author = name && phone
    ? `${name} (+${phone})`
    : name || (phone ? `+${phone}` : "desconhecido");

  const freshUnknown = unknown.length
    ? await recordUnknownLinks(unknown, { groupName: group.name, author, message })
    : [];

  if (matched.length === 0) {
    if (freshUnknown.length === 0) {
      return { ignored: false as const, action: "unknown_seen" };
    }
    const failure = await notifyAlertGroup(settings.notifyNumber, [
      `Link não identificado em ${group.name}`,
      `Quem: ${author}`,
      `Quando: ${formatWhen(message.timestamp)}`,
      `Link: ${freshUnknown.join(", ")}`,
      "",
      message.text,
      "",
      "Nada foi apagado. Libere ou bloqueie o domínio no painel de Moderação.",
    ]);
    if (failure) console.error(`[moderacao] aviso de link estranho: ${failure}`);
    return { ignored: false as const, action: "unknown" };
  }

  try {
    await prisma.moderationEvent.create({
      data: {
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
        groupName: group.name,
        author,
        authorName: name,
        authorPhone: phone ?? "",
        participant: message.participant ?? "",
        participantAlt: message.participantAlt ?? "",
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
  let deletedForEveryone = false;
  let attempts = 0;
  let nextAttemptAt: Date | null = null;

  if (settings.deleteMode) {
    attempts = 1;
    try {
      await deleteMessageForEveryone({
        id: message.waMessageId,
        remoteJid: message.remoteJid,
        participants: [message.participant, message.participantAlt],
      });
      deletedForEveryone = true;
      action = "deleted";
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
      action = "delete_failed";
      nextAttemptAt = nextAttemptAfter(attempts);
    }
  }

  if (deletedForEveryone && settings.announceDelete) {
    detail = await announceDeletion(settings.announceText, group.remoteJid, phone);
  }

  const outcome = !settings.deleteMode
    ? "A mensagem não foi apagada. O modo apagar está desligado."
    : deletedForEveryone
      ? "A mensagem foi apagada para todos no grupo."
      : `A mensagem não foi apagada para todos. ${detail} Vou tentar de novo sozinho nas próximas horas e aviso aqui.`;

  const notifyFailure = await notifyAlertGroup(settings.notifyNumber, [
    `Link bloqueado em ${group.name}`,
    `Quem: ${author}`,
    `Quando: ${formatWhen(message.timestamp)}`,
    `Link: ${matched.join(", ")}`,
    ...(unknown.length ? [`Link não identificado: ${unknown.join(", ")}`] : []),
    "",
    message.text,
    "",
    outcome,
  ]);
  if (notifyFailure) {
    detail = detail ? `${detail} | ${notifyFailure}` : notifyFailure;
    if (action !== "delete_failed") {
      action = deletedForEveryone ? "deleted_notify_failed" : "notify_failed";
    }
  }

  await prisma.moderationEvent.update({
    where: {
      groupJid_waMessageId: {
        groupJid: group.remoteJid,
        waMessageId: message.waMessageId,
      },
    },
    data: { action, detail, attempts, nextAttemptAt },
  });

  return { ignored: false as const, action };
}

type StoredEvent = Awaited<ReturnType<typeof prisma.moderationEvent.findFirstOrThrow>>;
type StoredSettings = Awaited<
  ReturnType<typeof prisma.moderationSettings.findUniqueOrThrow>
>;

async function retryDelete(event: StoredEvent, settings: StoredSettings) {
  const attempts = event.attempts + 1;
  const where = { id: event.id };
  const lines = [
    `Quem: ${event.author}`,
    `Quando: ${formatWhen(event.messageAt)}`,
    `Link: ${event.matchedUrl.split("\n").join(", ")}`,
  ];

  try {
    await deleteMessageForEveryone({
      id: event.waMessageId,
      remoteJid: event.groupJid,
      participants: [event.participant, event.participantAlt],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const next = nextAttemptAfter(attempts);
    const givingUp =
      !next || next.getTime() - event.messageAt.getTime() > RETRY_WINDOW_MS;
    await prisma.moderationEvent.update({
      where,
      data: {
        action: "delete_failed",
        attempts,
        nextAttemptAt: givingUp ? null : next,
        detail: givingUp
          ? `Desisti depois de ${attempts} tentativas. ${reason}`
          : `Tentativa ${attempts} falhou. ${reason}`,
      },
    });
    if (givingUp) {
      const failure = await notifyAlertGroup(settings.notifyNumber, [
        `APAGUE À MÃO: link bloqueado em ${event.groupName}`,
        ...lines,
        "",
        event.text,
        "",
        `Tentei apagar ${attempts} vezes e não consegui. ${reason}`,
      ]);
      if (failure) console.error(`[moderacao] aviso de desistência: ${failure}`);
    }
    return;
  }

  let detail = `Apagada na tentativa ${attempts}.`;
  if (settings.announceDelete) {
    const failure = await announceDeletion(
      settings.announceText,
      event.groupJid,
      event.authorPhone || null,
    );
    if (failure) detail = `${detail} ${failure}`;
  }
  await prisma.moderationEvent.update({
    where,
    data: { action: "deleted", attempts, nextAttemptAt: null, detail },
  });
  const failure = await notifyAlertGroup(settings.notifyNumber, [
    `Link apagado depois em ${event.groupName}`,
    ...lines,
    "",
    `Apaguei na tentativa ${attempts}.`,
  ]);
  if (failure) console.error(`[moderacao] aviso de exclusão atrasada: ${failure}`);
}

// Tenta de novo o que falhou e retoma o que ficou em "Processando" porque o
// processo caiu no meio. Depois de 24 horas desiste e pede para apagar à mão.
export async function retryFailedDeletes() {
  const settings = await prisma.moderationSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings?.enabled || !settings.deleteMode) return { retried: 0 };

  const now = Date.now();
  const events = await prisma.moderationEvent.findMany({
    where: {
      messageAt: { gt: new Date(now - RETRY_WINDOW_MS) },
      OR: [
        { action: "delete_failed", nextAttemptAt: { lte: new Date(now) } },
        { action: "pending", createdAt: { lt: new Date(now - STUCK_PENDING_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  for (const event of events) {
    try {
      await retryDelete(event, settings);
    } catch (err) {
      console.error(`[moderacao] nova tentativa ${event.id}:`, err);
    }
  }
  return { retried: events.length };
}

export function startModerationWorker() {
  const holder = globalThis as {
    __moderationWorker?: ReturnType<typeof setInterval>;
  };
  if (holder.__moderationWorker) return;
  let running = false;
  holder.__moderationWorker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await retryFailedDeletes();
    } catch (err) {
      console.error("[moderacao] fila de exclusão:", err);
    } finally {
      running = false;
    }
  }, 60_000);
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
    participantAlt: message.participantAlt,
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
