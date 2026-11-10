"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Lang = "pt" | "en" | "es";
type Net = "tiktok" | "instagram" | "youtube";

const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];
const NETS: { id: Net; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
];

function usd(value: number) {
  return `US$ ${value.toFixed(2).replace(".", ",")}`;
}

async function saveSettings(data: Record<string, unknown>) {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Falha ao salvar");
}

function Toggle({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[var(--line)] bg-white/60 p-4">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-[var(--ink-soft)]">{detail}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Liga/desliga uma fonte no job automático; salva na hora. */
export function AutoToggle({
  field,
  initial,
  label,
  detail,
}: {
  field: "groupSource" | "viralSource";
  initial: boolean;
  label: string;
  detail: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [info, setInfo] = useState<string | null>(null);

  async function change(next: boolean) {
    setValue(next);
    setInfo(null);
    try {
      await saveSettings({ [field]: next });
      setInfo(next ? "Ligado no job das 6h." : "Desligado do job das 6h.");
      router.refresh();
    } catch (err) {
      setValue(!next);
      setInfo(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-1">
      <Toggle checked={value} onChange={change} label={label} detail={detail} />
      {info && <p className="text-xs text-[var(--ink-soft)]">{info}</p>}
    </div>
  );
}

export function TrendsSettings({
  initial,
  costs,
  apifyReady,
  youtubeApiReady,
}: {
  initial: {
    viralPerSearch: number;
    viralTerms: Record<Lang, string[]>;
    viralPlatforms: Net[];
    ignoreAuthors: string;
  };
  costs: Record<Net, number>;
  apifyReady: boolean;
  youtubeApiReady: boolean;
}) {
  const router = useRouter();
  const [perSearch, setPerSearch] = useState(initial.viralPerSearch);
  const [nets, setNets] = useState<Net[]>(initial.viralPlatforms);
  const [ignore, setIgnore] = useState(initial.ignoreAuthors);
  const [terms, setTerms] = useState<Record<Lang, string>>({
    pt: initial.viralTerms.pt.join("\n"),
    en: initial.viralTerms.en.join("\n"),
    es: initial.viralTerms.es.join("\n"),
  });
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const lists = Object.fromEntries(
    LANGS.map(({ id }) => [
      id,
      terms[id]
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
    ]),
  ) as Record<Lang, string[]>;
  const searches = lists.pt.length + lists.en.length + lists.es.length;
  const monthly = (net: Net) => searches * perSearch * 30 * costs[net];
  const perMonth = nets.reduce((sum, net) => sum + monthly(net), 0);
  const youtubeClick = searches * perSearch * costs.youtube;

  async function save() {
    setSaving(true);
    setInfo(null);
    try {
      await saveSettings({
        viralPerSearch: perSearch,
        viralTerms: lists,
        viralPlatforms: nets,
        ignoreAuthors: ignore,
      });
      setInfo("Salvo.");
      router.refresh();
    } catch (err) {
      setInfo(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {!apifyReady && (
        <p className="rounded-xl bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)]">
          Falta configurar o APIFY_TOKEN no servidor. Sem ele a busca de vídeos não roda.
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Onde buscar</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {NETS.map(({ id, label }) => {
            const on = nets.includes(id);
            return (
              <label
                key={id}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${
                  on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-white/60"
                }`}
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={on}
                    onChange={(e) =>
                      setNets(e.target.checked ? [...nets, id] : nets.filter((n) => n !== id))
                    }
                  />
                  {label}
                </span>
                <span className="text-xs text-[var(--ink-soft)]">
                  {costs[id] === 0 ? "grátis (API oficial)" : `~${usd(monthly(id))}/mês`}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">O que buscar (um termo por linha)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {LANGS.map(({ id, label }) => (
            <label key={id} className="flex flex-col gap-1 text-sm text-[var(--ink-soft)]">
              {label}
              <textarea
                className="field min-h-20 text-sm"
                value={terms[id]}
                onChange={(e) => setTerms({ ...terms, [id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          No Instagram cada termo vira hashtag (“impressão 3d” → #impressao3d). A tela YouTube
          usa os mesmos termos.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Vídeos por termo, em cada rede
          <input
            type="number"
            min={1}
            max={50}
            className="field max-w-28 font-normal"
            value={perSearch}
            onChange={(e) => setPerSearch(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Ignorar perfis (os seus)
          <input
            className="field font-normal"
            value={ignore}
            onChange={(e) => setIgnore(e.target.value)}
            placeholder="primeirasimpressoes.3d"
          />
        </label>
      </div>

      <div className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm">
        <p>
          Custo estimado da busca diária: <strong>{usd(perMonth)}/mês</strong> no Apify (o plano
          grátis dá US$ 5/mês).
        </p>
        <p className="mt-1 text-[var(--ink-soft)]">
          Cada busca na tela YouTube:{" "}
          {youtubeClick === 0 ? "grátis (API oficial)" : `cerca de ${usd(youtubeClick)}`}.
          {!youtubeApiReady &&
            " Com a chave da API oficial do YouTube (YOUTUBE_API_KEY), o YouTube fica grátis."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Salvando..." : "Salvar tendências"}
        </button>
        {info && <p className="text-sm">{info}</p>}
      </div>
    </div>
  );
}

/** Tom de voz ou modelos de ganchos: um texto grande com salvar. */
export function TextFileEditor({
  endpoint,
  initial,
  placeholder,
}: {
  endpoint: string;
  initial: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setInfo(null);
    const res = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value }),
    });
    setSaving(false);
    setInfo(res.ok ? "Salvo." : "Falha ao salvar.");
  }

  return (
    <div className="space-y-3">
      <textarea
        className="field min-h-64 font-mono text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {info && <p className="text-sm">{info}</p>}
      </div>
    </div>
  );
}

export function EvolutionTest() {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setInfo(null);
          const res = await fetch("/api/evolution/test", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          setInfo(data.ok ? `Conectado: ${data.detail}` : `Falhou: ${data.detail ?? "sem resposta"}`);
        }}
      >
        {busy ? "Testando..." : "Testar conexão com o WhatsApp"}
      </button>
      {info && <p className="text-sm">{info}</p>}
    </div>
  );
}
