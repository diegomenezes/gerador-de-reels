import { runActor } from "./apify";
import { cleanText } from "./viral";

// Transcrição do que foi falado num vídeo de referência. Só roda quando o criador pede
// ("Gerar com a fala do vídeo"), porque cada busca custa alguns centavos no Apify.

const MAX_CHARS = 4000;
const LIMITS = { maxItems: 1, maxTotalChargeUsd: 0.5 };

function platformOf(url: string): "tiktok" | "youtube" | "instagram" | null {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("instagram.com")) return "instagram";
  return null;
}

/** Arquivo WebVTT em texto corrido (sem tempos nem repetições de linha). */
function vttToText(vtt: string): string {
  const lines: string[] = [];
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.replace(/<[^>]+>/g, "").trim();
    if (!line || line === "WEBVTT" || /-->/.test(line) || /^\d+$/.test(line)) continue;
    if (/^(Kind|Language|NOTE)\b/.test(line)) continue;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  return lines.join(" ");
}

async function fromTikTok(url: string): Promise<string | null> {
  const [item] = await runActor(
    "clockworks/tiktok-scraper",
    {
      postURLs: [url],
      downloadSubtitlesOptions: "DOWNLOAD_SUBTITLES",
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      shouldDownloadMusicCovers: false,
    },
    LIMITS,
  );
  const meta = item?.videoMeta as { subtitleLinks?: { language?: string; downloadLink?: string; source?: string }[] } | undefined;
  const links = (meta?.subtitleLinks ?? []).filter((l) => l.downloadLink);
  if (links.length === 0) return null;
  // legenda original antes da tradução automática (source "MT")
  const lang = String(item?.textLanguage ?? "").slice(0, 2);
  const pick =
    links.find((l) => l.source !== "MT" && l.language?.startsWith(lang)) ??
    links.find((l) => l.source !== "MT") ??
    links.find((l) => l.language?.startsWith(lang)) ??
    links[0];
  const vtt = await fetchApifyText(pick.downloadLink!);
  return vtt ? vttToText(vtt) : null;
}

async function fromYouTube(url: string): Promise<string | null> {
  const [item] = await runActor(
    "streamers/youtube-scraper",
    {
      startUrls: [{ url }],
      maxResults: 1,
      maxResultsShorts: 1,
      transcriptionAndSubtitle: "TRANSCRIPTION_AS_FALLBACK",
      subtitlesLanguage: "any",
      subtitlesFormat: "plaintext",
    },
    LIMITS,
  );
  const subtitles = (item?.subtitles as { plaintext?: string; type?: string }[] | null) ?? [];
  const best = subtitles.find((s) => s.type !== "auto_generated" && s.plaintext) ?? subtitles.find((s) => s.plaintext);
  if (best?.plaintext) return best.plaintext.replace(/\s*\n\s*/g, " ");
  // sem legenda: o Apify transcreve o áudio e entrega o texto num link à parte
  if (typeof item?.transcriptionUrl === "string") return fetchApifyText(item.transcriptionUrl);
  return null;
}

/** Baixa um arquivo de texto guardado no Apify (precisa do token). */
async function fetchApifyText(url: string): Promise<string | null> {
  const link = new URL(url);
  if (link.hostname === "api.apify.com" && process.env.APIFY_TOKEN) {
    link.searchParams.set("token", process.env.APIFY_TOKEN.trim());
  }
  const res = await fetch(link, { signal: AbortSignal.timeout(30_000) });
  return res.ok ? res.text() : null;
}

async function fromInstagram(url: string): Promise<string | null> {
  const items = await runActor(
    "steadyfetch/instagram-reel-transcript-scraper",
    { reelUrls: [url], maxItems: 1 },
    { maxItems: 2, maxTotalChargeUsd: 0.5 },
  );
  const withText = items.find((i) => typeof i.transcript === "string" && i.transcript.trim());
  return (withText?.transcript as string | undefined) ?? null;
}

/** Busca o que foi falado no vídeo. Devolve null se a rede não der transcrição. */
export async function fetchTranscript(url: string): Promise<string | null> {
  const platform = platformOf(url);
  if (!platform) return null;
  const text =
    platform === "tiktok"
      ? await fromTikTok(url)
      : platform === "youtube"
        ? await fromYouTube(url)
        : await fromInstagram(url);
  const clean = text ? cleanText(text.replace(/\s+/g, " ").trim(), MAX_CHARS) : "";
  return clean.length >= 20 ? clean : null;
}
