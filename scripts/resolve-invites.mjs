import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE;
const headers = { apikey: apiKey, "Content-Type": "application/json" };

const invites = [
  {
    name: "Primeiras Impressões 3D #1",
    url: "https://chat.whatsapp.com/BjW3KKRtvDABNnCybYJyDP",
  },
  {
    name: "Primeiras Impressões 3D #2",
    url: "https://chat.whatsapp.com/LvCCrmRMGtkFkdZnAtUXDf",
  },
  {
    name: "Primeiras Impressões 3D #3",
    url: "https://chat.whatsapp.com/ECWE8Y82Ce3Ff5OokbPhqR",
  },
  {
    name: "Primeiras Impressões 3D #4",
    url: "https://chat.whatsapp.com/CWTAdjeonQ0FB4vO7fmWo3",
  },
];

function codeFrom(url) {
  return url.split("/").pop().trim();
}

function pickId(json) {
  if (!json || typeof json !== "object") return null;
  return (
    json.id ||
    json.groupJid ||
    json.jid ||
    json.remoteJid ||
    json?.groupMetadata?.id ||
    json?.data?.id ||
    json?.data?.groupJid ||
    null
  );
}

function pickSubject(json) {
  if (!json || typeof json !== "object") return null;
  return (
    json.subject ||
    json.name ||
    json?.groupMetadata?.subject ||
    json?.data?.subject ||
    json?.data?.name ||
    null
  );
}

async function resolveInvite(code) {
  const attempts = [
    () =>
      fetch(
        `${base}/group/inviteInfo/${encodeURIComponent(instance)}?inviteCode=${encodeURIComponent(code)}`,
        { headers },
      ),
    () =>
      fetch(
        `${base}/group/inviteInfo/${encodeURIComponent(instance)}/${encodeURIComponent(code)}`,
        { headers },
      ),
    () =>
      fetch(
        `${base}/group/getInviteInfo/${encodeURIComponent(instance)}?inviteCode=${encodeURIComponent(code)}`,
        { headers },
      ),
    () =>
      fetch(`${base}/group/inviteInfo/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteCode: code }),
      }),
    () =>
      fetch(`${base}/group/acceptInviteCode/${encodeURIComponent(instance)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteCode: code }),
      }),
  ];

  const errors = [];
  for (const fn of attempts) {
    try {
      const res = await fn();
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // ignore
      }
      const id = pickId(json);
      if (res.ok && id) {
        return {
          ok: true,
          id: String(id),
          subject: pickSubject(json),
        };
      }
      errors.push({ status: res.status, preview: text.slice(0, 250) });
    } catch (e) {
      errors.push({ error: String(e) });
    }
  }
  return { ok: false, errors };
}

const prisma = new PrismaClient();
const results = [];

for (const inv of invites) {
  const code = codeFrom(inv.url);
  const resolved = await resolveInvite(code);
  if (!resolved.ok) {
    results.push({ name: inv.name, code, ok: false, errors: resolved.errors });
    continue;
  }

  const remoteJid = resolved.id.includes("@")
    ? resolved.id
    : `${resolved.id}@g.us`;
  const name = resolved.subject || inv.name;

  const group = await prisma.group.upsert({
    where: { remoteJid },
    create: { name, remoteJid, active: true },
    update: { name, active: true },
  });

  results.push({
    ok: true,
    name: group.name,
    remoteJid: group.remoteJid,
    dbId: group.id,
  });
}

console.log(JSON.stringify(results, null, 2));
await prisma.$disconnect();
