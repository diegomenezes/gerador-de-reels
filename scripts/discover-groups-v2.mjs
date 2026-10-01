import "dotenv/config";

const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE;
const headers = { apikey: apiKey, "Content-Type": "application/json" };

const inviteCodes = [
  "BjW3KKRtvDABNnCybYJyDP",
  "LvCCrmRMGtkFkdZnAtUXDf",
  "ECWE8Y82Ce3Ff5OokbPhqR",
  "CWTAdjeonQ0FB4vO7fmWo3",
];

async function req(method, path, body, timeoutMs = 20000) {
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

console.log("=== scrape invite pages ===");
for (const code of inviteCodes) {
  const url = `https://chat.whatsapp.com/${code}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    const html = await res.text();
    const idMatches = [
      ...html.matchAll(/(\d{10,}@g\.us)/g),
      ...html.matchAll(/"groupId"\s*:\s*"([^"]+)"/g),
      ...html.matchAll(/"id"\s*:\s*"(\d{10,}@g\.us)"/g),
      ...html.matchAll(/group_id%22%3A%22([^%]+)/g),
    ].map((m) => m[1]);
    const title =
      html.match(/property="og:title" content="([^"]+)"/)?.[1] ||
      html.match(/<title>([^<]+)<\/title>/)?.[1];
    console.log(code, {
      status: res.status,
      title,
      ids: [...new Set(idMatches)],
      snippet: html.includes("@g.us") ? "has @g.us" : "no @g.us in html",
    });
  } catch (e) {
    console.log(code, String(e));
  }
}

console.log("\n=== filtered findChats ===");
const bodies = [
  { where: { name: "Primeiras Impressões 3D #1" } },
  { where: { pushName: "Primeiras Impressões 3D #1" } },
  { where: { id: { contains: "@g.us" } } },
  { where: { remoteJid: { $regex: "@g.us$" } } },
  { where: { isGroup: true } },
  { limit: 20 },
  { take: 20 },
  { page: 1, offset: 20 },
  { where: {}, page: 1, offset: 10 },
];

for (const body of bodies) {
  const r = await req("POST", `/chat/findChats/${instance}`, body, 15000);
  const list = Array.isArray(r.json)
    ? r.json
    : r.json?.chats || r.json?.data || r.json?.records || [];
  const arr = Array.isArray(list) ? list : [];
  const preview = arr.slice(0, 5).map((c) => ({
    id: c.id || c.remoteJid || c.jid,
    name: c.name || c.subject || c.pushName,
  }));
  console.log(JSON.stringify(body), "=>", r.status, "count~", arr.length, preview);
  if (!r.ok && r.status !== 0) console.log(" ", r.text.slice(0, 180));
}

console.log("\n=== inviteInfo again + join ===");
for (const code of inviteCodes) {
  const info = await req(
    "GET",
    `/group/inviteInfo/${instance}?inviteCode=${code}`,
  );
  console.log(
    "inviteInfo",
    code,
    info.status,
    info.text.slice(0, 220),
  );
}

// try manager/chat endpoints common in evolution
console.log("\n=== other endpoints ===");
for (const path of [
  `/chat/findContacts/${instance}`,
  `/instance/fetchInstances`,
  `/group/fetchAllGroups/${instance}?getParticipants=false`,
]) {
  const method = path.includes("findContacts") ? "POST" : "GET";
  const r = await req(method, path, method === "POST" ? {} : undefined, 20000);
  console.log(method, path, r.status, r.text.slice(0, 250));
}
