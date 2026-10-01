import "dotenv/config";

const base = process.env.EVOLUTION_BASE_URL.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY;
const instance = process.env.EVOLUTION_INSTANCE;
const headers = { apikey: apiKey, "Content-Type": "application/json" };

const invites = [
  ["#1", "BjW3KKRtvDABNnCybYJyDP"],
  ["#2", "LvCCrmRMGtkFkdZnAtUXDf"],
  ["#3", "ECWE8Y82Ce3Ff5OokbPhqR"],
  ["#4", "CWTAdjeonQ0FB4vO7fmWo3"],
];

async function req(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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
    return { status: res.status, ok: res.ok, text: text.slice(0, 500), json };
  } catch (e) {
    return { status: 0, ok: false, text: String(e), json: null };
  } finally {
    clearTimeout(timer);
  }
}

function pickGroups(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.groups ||
      payload?.chats ||
      payload?.data ||
      payload?.records ||
      payload?.response ||
      [];
  if (!Array.isArray(list)) return [];
  return list
    .map((g) => {
      const id = g?.id || g?.remoteJid || g?.jid || g?.key?.remoteJid;
      const name = g?.subject || g?.name || g?.pushName || g?.notify || "";
      return id
        ? {
            id: String(id),
            name: String(name),
          }
        : null;
    })
    .filter(Boolean);
}

console.log("=== connection ===");
console.log(
  await req("GET", `/instance/connectionState/${encodeURIComponent(instance)}`),
);

console.log("\n=== inviteInfo variants ===");
for (const [label, code] of invites) {
  const attempts = [
    ["GET", `/group/inviteInfo/${instance}?inviteCode=${code}`],
    ["GET", `/group/inviteCode/${instance}?inviteCode=${code}`],
    ["POST", `/group/acceptInviteCode/${instance}`, { inviteCode: code }],
    ["GET", `/group/participation/${instance}?inviteCode=${code}`],
  ];
  for (const [method, path, body] of attempts) {
    const r = await req(method, path, body);
    const id =
      r.json?.id ||
      r.json?.groupJid ||
      r.json?.jid ||
      r.json?.remoteJid ||
      r.json?.data?.id;
    if (id) {
      console.log(label, "FOUND via", method, path, "=>", id, r.json?.subject || r.json?.name);
      break;
    }
    if (r.status !== 404) {
      console.log(label, method, path, r.status, r.text.slice(0, 180));
    }
  }
}

console.log("\n=== findChats / findGroups ===");
const chatAttempts = [
  ["POST", `/chat/findChats/${instance}`, {}],
  ["POST", `/chat/findChats/${instance}`, { where: {} }],
  ["GET", `/chat/findChats/${instance}`],
  ["POST", `/group/findGroupInfos/${instance}`, {}],
  [
    "GET",
    `/group/fetchAllGroups/${instance}?getParticipants=false`,
  ],
];

for (const [method, path, body] of chatAttempts) {
  const r = await req(method, path, body);
  const groups = pickGroups(r.json).filter(
    (g) =>
      g.id.includes("@g.us") ||
      /primeiras impress/i.test(g.name) ||
      /3d/i.test(g.name),
  );
  const all = pickGroups(r.json);
  console.log(
    method,
    path,
    "status=",
    r.status,
    "items=",
    all.length,
    "filtered=",
    groups.length,
  );
  if (groups.length) {
    console.log(
      "matches:",
      groups
        .filter((g) => /primeiras|impress/i.test(g.name) || g.id.includes("@g.us"))
        .slice(0, 20),
    );
  } else if (!r.ok) {
    console.log("err:", r.text.slice(0, 200));
  } else if (all.length && all.length < 30) {
    console.log("sample:", all.slice(0, 10));
  } else if (all.length) {
    const named = all.filter((g) => /primeiras|impressoes|impressões/i.test(g.name));
    console.log("named matches:", named);
    if (!named.length) {
      console.log(
        "name samples:",
        all
          .map((g) => g.name)
          .filter(Boolean)
          .slice(0, 15),
      );
    }
  }
}
