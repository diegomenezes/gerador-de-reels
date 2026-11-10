import { prisma } from "./db";
import { runActor } from "./apify";
import { searchYoutube, youtubeApiConfigured } from "./youtube";

// Busca de vídeos de impressão 3D que estão indo bem no TikTok, Reels e YouTube.

export type Lang = "pt" | "en" | "es";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];
export type ViralTerms = Record<Lang, string[]>;

export const PLATFORM_LABEL: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Reels",
  youtube: "Shorts",
  "youtube-long": "YouTube",
};

export type Platform = "tiktok" | "instagram" | "youtube" | "youtube-long";
export const SHORT_PLATFORMS = ["tiktok", "instagram", "youtube"] as const;

// preço real medido por vídeo no Apify (resultado + filtros pagos)
const APIFY_COST: Record<Platform, number> = {
  tiktok: 0.0068,
  instagram: 0.0026,
  youtube: 0.004,
  "youtube-long": 0.004,
};

/** Custo por vídeo; o YouTube sai de graça quando a API oficial está configurada. */
export function costPerVideo(platform: Platform): number {
  if ((platform === "youtube" || platform === "youtube-long") && youtubeApiConfigured()) return 0;
  return APIFY_COST[platform];
}

export function parsePlatforms(raw: string): Platform[] {
  const valid = new Set<string>(SHORT_PLATFORMS);
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is Platform => valid.has(p));
}

export function parseAuthors(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((a) => a.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

const ACTORS = {
  tiktok: "clockworks/tiktok-scraper",
  instagram: "apify/instagram-hashtag-scraper",
  youtube: "streamers/youtube-scraper",
};

export async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export function parseTerms(raw: string): ViralTerms {
  try {
    const value = JSON.parse(raw) as Partial<Record<Lang, unknown>>;
    const pick = (v: unknown) =>
      Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
    return { pt: pick(value.pt), en: pick(value.en), es: pick(value.es) };
  } catch {
    return { pt: [], en: [], es: [] };
  }
}

export function searchCount(terms: ViralTerms) {
  return terms.pt.length + terms.en.length + terms.es.length;
}

// --- normalização dos resultados de cada ator ---

type Video = {
  platform: string;
  externalId: string;
  url: string;
  caption: string;
  author: string | null;
  views: number;
  likes: number;
  comments: number;
  publishedAt: Date | null;
};

function num(...values: unknown[]): number {
  for (const v of values) {
    const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
    if (typeof n === "number" && Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function str(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function durationSeconds(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return value
    .split(":")
    .map(Number)
    .reduce((acc, part) => acc * 60 + (Number.isFinite(part) ? part : 0), 0);
}

function fromTikTok(item: Record<string, unknown>): Video | null {
  const url = str(item.webVideoUrl, item.url);
  const id = str(item.id, url);
  if (!url || !id) return null;
  const author = item.authorMeta as Record<string, unknown> | undefined;
  return {
    platform: "tiktok",
    externalId: id,
    url,
    caption: str(item.text, item.desc),
    author: str(author?.name, author?.nickName) || null,
    views: num(item.playCount),
    likes: num(item.diggCount),
    comments: num(item.commentCount),
    publishedAt: date(item.createTimeISO ?? (num(item.createTime) * 1000 || null)),
  };
}

function fromInstagram(item: Record<string, unknown>): Video | null {
  const shortCode = str(item.shortCode, item.code);
  const url = str(item.url) || (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : "");
  const id = str(item.id, shortCode, url);
  if (!url || !id) return null;
  return {
    platform: "instagram",
    externalId: id,
    url,
    caption: str(item.caption),
    author: str(item.ownerUsername) || null,
    views: num(item.videoPlayCount, item.videoViewCount, item.playsCount),
    likes: num(item.likesCount),
    comments: num(item.commentsCount),
    publishedAt: date(item.timestamp),
  };
}

function fromYouTube(item: Record<string, unknown>, platform: "youtube" | "youtube-long"): Video | null {
  const url = str(item.url);
  const id = str(item.id, url);
  if (!url || !id) return null;
  const title = str(item.title);
  const description = str(item.text, item.description).slice(0, 400);
  return {
    platform,
    externalId: id,
    url,
    caption: description ? `${title}\n${description}` : title,
    author: str(item.channelName) || null,
    views: num(item.viewCount),
    likes: num(item.likes),
    comments: num(item.commentsCount),
    publishedAt: date(item.date),
  };
}

function hashtag(term: string) {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function limits(perSearch: number) {
  // o Apify exige teto mínimo de US$ 0,50 por execução; o gasto real é por vídeo
  return { maxItems: perSearch, maxTotalChargeUsd: Math.max(0.5, perSearch * 0.012) };
}

async function fetchPlatform(
  platform: Platform,
  term: string,
  lang: Lang,
  perSearch: number,
): Promise<Video[]> {
  if (platform === "tiktok") {
    const items = await runActor(
      ACTORS.tiktok,
      {
        searchQueries: [term],
        searchSection: "/video",
        resultsPerPage: perSearch,
        videoSearchSorting: "MOST_LIKED",
        videoSearchDateFilter: "PAST_MONTH",
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSlideshowImages: false,
        shouldDownloadAvatars: false,
        shouldDownloadMusicCovers: false,
      },
      limits(perSearch),
    );
    return items.map(fromTikTok).filter((v): v is Video => v !== null);
  }
  if (platform === "instagram") {
    const items = await runActor(
      ACTORS.instagram,
      { hashtags: [hashtag(term)], resultsType: "reels", resultsLimit: perSearch },
      limits(perSearch),
    );
    return items.map(fromInstagram).filter((v): v is Video => v !== null);
  }
  const long = platform === "youtube-long";
  if (youtubeApiConfigured()) {
    const videos = await searchYoutube(term, lang, perSearch, long ? "long" : "short");
    return videos.map((v) => ({
      platform,
      externalId: v.id,
      url: v.url,
      caption: v.description ? `${v.title}\n${v.description}` : v.title,
      author: v.channel || null,
      views: v.views,
      likes: v.likes,
      comments: v.comments,
      publishedAt: v.publishedAt,
    }));
  }
  // sem a API oficial: Apify. A busca de Shorts com ordenação/data volta vazia, então vai sem.
  const items = await runActor(
    ACTORS.youtube,
    long
      ? { searchQueries: [term], maxResults: perSearch, maxResultsShorts: 0, maxResultStreams: 0, sortingOrder: "views", dateFilter: "year" }
      : { searchQueries: [term], maxResults: 0, maxResultsShorts: perSearch, maxResultStreams: 0 },
    limits(perSearch),
  );
  return items
    .filter((item) => !item.error)
    .filter((item) => !long || durationSeconds(item.duration) === 0 || durationSeconds(item.duration) >= 240)
    .map((item) => fromYouTube(item, platform))
    .filter((v): v is Video => v !== null);
}

/**
 * Busca os vídeos de cada termo em cada rede e grava os novos.
 * Uma rede com erro não derruba as outras; só falha se todas falharem.
 */
export async function collectVideos(
  platforms: Platform[],
  terms: ViralTerms,
  perSearch: number,
  ignoreAuthors: string[],
  onProgress?: (label: string) => Promise<void> | void,
): Promise<{ found: number; errors: string[] }> {
  if (platforms.length === 0) throw new Error("Ligue pelo menos uma rede em Config");
  const ignored = new Set(ignoreAuthors);
  const searches = LANGS.flatMap(({ id }) => terms[id].map((term) => ({ lang: id, term })));
  if (searches.length === 0) throw new Error("Cadastre pelo menos um termo de busca em Config");

  const errors: string[] = [];
  let found = 0;
  let failedPlatforms = 0;

  await Promise.all(
    platforms.map(async (platform) => {
      let platformOk = false;
      for (const { lang, term } of searches) {
        try {
          await onProgress?.(`${PLATFORM_LABEL[platform]}: "${term}"`);
          const videos = await fetchPlatform(platform, term, lang, perSearch);
          platformOk = true;
          for (const video of videos) {
            // seus próprios vídeos não viram referência
            if (video.author && ignored.has(video.author.toLowerCase())) continue;
            await prisma.viralVideo.upsert({
              where: {
                platform_externalId: { platform: video.platform, externalId: video.externalId },
              },
              create: { ...video, language: lang, term },
              // números atualizados; usedAt fica como está
              update: { views: video.views, likes: video.likes, comments: video.comments },
            });
            found += 1;
          }
        } catch (err) {
          errors.push(`${PLATFORM_LABEL[platform]} "${term}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (!platformOk) failedPlatforms += 1;
    }),
  );

  if (failedPlatforms === platforms.length) {
    throw new Error(errors.slice(0, 3).join(" | ") || "Nenhum vídeo encontrado");
  }
  return { found, errors };
}

/** Os vídeos mais vistos de cada rede ainda não usados em ideias. */
export async function pickVideosForIdeas(
  platforms: string[],
  perPlatform: number,
  sinceDays: number,
) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const groups = await Promise.all(
    platforms.map((platform) =>
      prisma.viralVideo.findMany({
        where: { platform, usedAt: null, fetchedAt: { gte: since } },
        orderBy: [{ views: "desc" }, { likes: "desc" }],
        take: perPlatform,
      }),
    ),
  );
  return groups.flat();
}

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mil`;
  return String(n);
}
