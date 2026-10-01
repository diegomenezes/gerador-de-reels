import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE;
const headers = { apikey: apiKey, "Content-Type": "application/json" };

const TARGETS = [
  "Primeiras Impressões 3D #1",
  "Primeiras Impressões 3D #2",
  "Primeiras Impressões 3D #3",
  "Primeiras Impressões 3D #4",
];

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const targetMap = new Map(TARGETS.map((n) => [normalize(n), n]));

async function fetchGroups() {
  const urls = [
    `${base}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`,
    `${base}/group/fetchAllGroups/${encodeURIComponent(instance)}`,
  ];

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      console.log("Trying", url);
      const res = await fetch(url, { headers, signal: controller.signal });
      const text = await res.text();
      clearTimeout(timer);
      if (!res.ok) {
        console.log("Fail", res.status, text.slice(0, 200));
        continue;
      }
      const json = JSON.parse(text);
      const list = Array.isArray(json)
        ? json
        : json.groups || json.data || json.records || [];
      console.log("Total groups returned:", list.length);
      return list;
    } catch (e) {
      clearTimeout(timer);
      console.log("Error:", String(e));
    }
  }
  return null;
}

const list = await fetchGroups();
if (!list) {
  console.log(JSON.stringify({ ok: false, error: "Não foi possível listar grupos" }));
  process.exit(1);
}

const matches = [];
for (const g of list) {
  const id = g.id || g.remoteJid || g.jid;
  const name = g.subject || g.name || "";
  const key = normalize(name);
  if (id && targetMap.has(key)) {
    matches.push({
      name: targetMap.get(key),
      subject: name,
      remoteJid: String(id).includes("@") ? String(id) : `${id}@g.us`,
    });
  }
}

// fallback: starts with "primeiras impressoes 3d #"
if (matches.length < 4) {
  for (const g of list) {
    const id = g.id || g.remoteJid || g.jid;
    const name = g.subject || g.name || "";
    const key = normalize(name);
    if (!id || !key.includes("primeiras impressoes 3d")) continue;
    const remoteJid = String(id).includes("@") ? String(id) : `${id}@g.us`;
    if (matches.some((m) => m.remoteJid === remoteJid)) continue;
    matches.push({ name: name || key, subject: name, remoteJid });
  }
}

const prisma = new PrismaClient();
const saved = [];
for (const m of matches) {
  const group = await prisma.group.upsert({
    where: { remoteJid: m.remoteJid },
    create: { name: m.name, remoteJid: m.remoteJid, active: true },
    update: { name: m.name, active: true },
  });
  saved.push({
    name: group.name,
    remoteJid: group.remoteJid,
    dbId: group.id,
  });
}

console.log(
  JSON.stringify(
    {
      ok: saved.length > 0,
      matched: saved.length,
      saved,
      hint:
        saved.length < 4
          ? "Alguns nomes não bateram exatamente; confira a lista salva."
          : "Todos os 4 grupos cadastrados.",
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
