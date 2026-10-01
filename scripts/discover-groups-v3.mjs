import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE;
const headers = { apikey: apiKey, "Content-Type": "application/json" };

async function req(method, path, body, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // ignore
    }
    return { status: res.status, ok: res.ok, text, json };
  } catch (e) {
    return { status: 0, ok: false, text: String(e), json: null };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("1) state", (await req("GET", `/instance/connectionState/${instance}`)).text);

console.log("2) restart...");
console.log((await req("PUT", `/instance/restart/${instance}`)).text.slice(0, 300));
console.log((await req("POST", `/instance/restart/${instance}`)).text.slice(0, 300));

await sleep(8000);
console.log("3) state", (await req("GET", `/instance/connectionState/${instance}`)).text);

console.log("4) connect...");
console.log((await req("GET", `/instance/connect/${instance}`)).text.slice(0, 300));
await sleep(5000);
console.log("5) state", (await req("GET", `/instance/connectionState/${instance}`)).text);

console.log("6) fetchAllGroups...");
const groupsRes = await req(
  "GET",
  `/group/fetchAllGroups/${instance}?getParticipants=false`,
  undefined,
  90000,
);
console.log("status", groupsRes.status, groupsRes.text.slice(0, 400));

const list = Array.isArray(groupsRes.json)
  ? groupsRes.json
  : groupsRes.json?.groups || groupsRes.json?.data || [];

const matches = (Array.isArray(list) ? list : [])
  .map((g) => ({
    id: String(g.id || g.remoteJid || g.jid || ""),
    name: String(g.subject || g.name || ""),
  }))
  .filter(
    (g) =>
      /primeiras\s*impress/i.test(g.name) ||
      /impressões\s*3d/i.test(g.name) ||
      /impressoes\s*3d/i.test(g.name),
  );

console.log("matched", matches.length, matches);

if (matches.length) {
  const prisma = new PrismaClient();
  const saved = [];
  for (const m of matches) {
    const remoteJid = m.id.includes("@") ? m.id : `${m.id}@g.us`;
    const group = await prisma.group.upsert({
      where: { remoteJid },
      create: { name: m.name || remoteJid, remoteJid, active: true },
      update: { name: m.name || remoteJid, active: true },
    });
    saved.push({ name: group.name, remoteJid: group.remoteJid });
  }
  console.log("SAVED", saved);
  await prisma.$disconnect();
} else {
  // last resort: try findMessages recent from unknown - no
  console.log("No matches. Trying findStatusMessage / labels...");
  for (const path of [
    `/label/findLabels/${instance}`,
    `/chat/findChats/${instance}`,
  ]) {
    const method = path.includes("findChats") || path.includes("findLabels") ? "POST" : "GET";
    const r = await req(method, path, {}, 20000);
    console.log(path, r.status, r.text.slice(0, 250));
  }
}
