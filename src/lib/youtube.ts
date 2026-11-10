// API oficial do YouTube (Data API v3): grátis, cota de 10.000 unidades por dia.
// Cada busca custa 100 unidades; os detalhes dos vídeos custam 1.

const API = "https://www.googleapis.com/youtube/v3";

export function youtubeApiConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY?.trim());
}

async function get(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("Configure YOUTUBE_API_KEY no .env");
  const query = new URLSearchParams({ ...params, key });
  const res = await fetch(`${API}/${path}?${query}`, { signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const message = (json?.error as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`;
    throw new Error(`YouTube: ${message}`);
  }
  return json ?? {};
}

/** Duração ISO 8601 (PT1M30S) em segundos. */
function isoSeconds(value: string): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(value);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v) || 0);
  return d * 86400 + h * 3600 + min * 60 + s;
}

export type YoutubeVideo = {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: Date | null;
  seconds: number;
};

/**
 * Busca os vídeos mais vistos de um termo.
 * short: até 3 minutos (Shorts), publicados nos últimos 60 dias.
 * long: de 4 a 20 minutos e acima, publicados no último ano.
 */
export async function searchYoutube(
  term: string,
  lang: string,
  max: number,
  kind: "short" | "long",
): Promise<YoutubeVideo[]> {
  const days = kind === "short" ? 60 : 365;
  const search = await get("search", {
    part: "id",
    q: term,
    type: "video",
    order: "viewCount",
    maxResults: String(Math.min(50, kind === "short" ? max * 2 : max)),
    videoDuration: kind === "short" ? "short" : "medium",
    publishedAfter: new Date(Date.now() - days * 86400_000).toISOString(),
    relevanceLanguage: lang,
  });
  const ids = ((search.items as { id?: { videoId?: string } }[] | undefined) ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const details = await get("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
  });
  const videos = ((details.items as Record<string, Record<string, unknown>>[] | undefined) ?? []).map(
    (item) => {
      const snippet = item.snippet ?? {};
      const stats = item.statistics ?? {};
      const seconds = isoSeconds(String(item.contentDetails?.duration ?? ""));
      const id = String(item.id);
      return {
        id,
        url:
          kind === "short" && seconds <= 180
            ? `https://www.youtube.com/shorts/${id}`
            : `https://www.youtube.com/watch?v=${id}`,
        title: String(snippet.title ?? ""),
        // corta por caractere para não partir emoji
        description: Array.from(String(snippet.description ?? "")).slice(0, 400).join(""),
        channel: String(snippet.channelTitle ?? ""),
        views: Number(stats.viewCount) || 0,
        likes: Number(stats.likeCount) || 0,
        comments: Number(stats.commentCount) || 0,
        publishedAt: snippet.publishedAt ? new Date(String(snippet.publishedAt)) : null,
        seconds,
      };
    },
  );
  return videos
    .filter((v) => (kind === "short" ? v.seconds > 0 && v.seconds <= 180 : v.seconds >= 240))
    .sort((a, b) => b.views - a.views)
    .slice(0, max);
}
