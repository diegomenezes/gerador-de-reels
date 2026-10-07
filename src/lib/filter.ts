const NOISE_EXACT = new Set([
  "ok",
  "okk",
  "okay",
  "sim",
  "nao",
  "não",
  "blz",
  "beleza",
  "valeu",
  "obrigado",
  "obrigada",
  "obg",
  "vlw",
  "top",
  "show",
  "kkk",
  "kkkk",
  "kkkkk",
  "haha",
  "hahaha",
  "👍",
  "🙏",
  "😂",
  "❤️",
]);

const DOUBT_PATTERNS = [
  /\?/,
  /\bcomo\b/i,
  /\bpor\s*que\b/i,
  /\bporque\b/i,
  /\bn[aã]o\s+consigo\b/i,
  /\balgu[eé]m\s+sabe\b/i,
  /\bpreciso\s+de\b/i,
  /\bd[uú]vida\b/i,
  /\bajuda\b/i,
  /\berro\b/i,
  /\bn[aã]o\s+entendi\b/i,
  /\bqual\b/i,
  /\bonde\b/i,
  /\bquando\b/i,
  /\bposso\b/i,
  /\bda\s+pra\b/i,
  /\bd[aá]\s+pra\b/i,
  /\btem\s+como\b/i,
  /\bme\s+explica\b/i,
];

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
}

export function isLikelyDoubt(text: string): boolean {
  const cleaned = normalize(text);
  if (cleaned.length < 12) return false;

  const lower = cleaned.toLowerCase();
  if (NOISE_EXACT.has(lower)) return false;
  if (/^(kk+|ha+h+|rs+|lol)+$/i.test(lower)) return false;
  if (/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(cleaned)) {
    return false;
  }

  return DOUBT_PATTERNS.some((re) => re.test(cleaned));
}

export type CompactMessage = {
  text: string;
  count: number;
};

/** Agrupa mensagens quase iguais e limita o lote enviado à IA. */
export function compactMessages(
  texts: string[],
  maxItems = 120,
): CompactMessage[] {
  const map = new Map<string, CompactMessage>();

  for (const raw of texts) {
    const text = normalize(raw);
    if (!text || !isLikelyDoubt(text)) continue;

    const key = text.toLowerCase().slice(0, 180);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { text: text.slice(0, 280), count: 1 });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.text.length - a.text.length)
    .slice(0, maxItems);
}

const THEME_STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "que",
  "com",
  "um",
  "uma",
  "para",
  "pra",
  "pro",
  "no",
  "na",
  "nos",
  "nas",
  "em",
  "por",
  "se",
  "eu",
  "voce",
  "nao",
  "ja",
  "mais",
  "como",
  "qual",
  "isso",
  "essa",
  "esse",
  "esta",
  "este",
  "ao",
  "aos",
]);

function themeTokens(text: string): string[] {
  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ");
  return clean
    .split(/\s+/)
    .filter((token) => token.length > 2 && !THEME_STOPWORDS.has(token))
    .map((token) =>
      token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token,
    );
}

/** Mesmo assunto de Reel, mesmo com artigo, plural ou pontuação diferentes. */
export function sameReelTheme(a: string, b: string): boolean {
  const left = themeTokens(a);
  const right = themeTokens(b);
  if (left.length === 0 || right.length === 0) return false;
  if (left.join(" ") === right.join(" ")) return true;

  const setA = new Set(left);
  const setB = new Set(right);
  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }
  const shorter = Math.min(setA.size, setB.size);
  const union = setA.size + setB.size - shared;
  return (
    (shorter >= 3 && shared / shorter >= 0.8) ||
    (shared >= 3 && shared / union >= 0.75)
  );
}
