"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Lang = "pt" | "en" | "es";
type Net = "tiktok" | "instagram" | "youtube";
const NETS: { id: Net; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "instagram", label: "Instagram Reels" },
  { id: "youtube", label: "YouTube Shorts" },
];

function usd(value: number) {
  return `US$ ${value.toFixed(2).replace(".", ",")}`;
}
const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

export function SourcesPanel({
  initial,
  apifyReady,
  youtubeApiReady,
  costs,
}: {
  initial: {
    groupSource: boolean;
    viralSource: boolean;
    viralPerSearch: number;
    viralTerms: Record<Lang, string[]>;
    viralPlatforms: Net[];
    ignoreAuthors: string;
  };
  apifyReady: boolean;
  youtubeApiReady: boolean;
  costs: Record<Net, number>;
}) {
  const router = useRouter();
  const [groupSource, setGroupSource] = useState(initial.groupSource);
  const [viralSource, setViralSource] = useState(initial.viralSource);
  const [perSearch, setPerSearch] = useState(initial.viralPerSearch);
  const [terms, setTerms] = useState<Record<Lang, string>>({
    pt: initial.viralTerms.pt.join("\n"),
    en: initial.viralTerms.en.join("\n"),
    es: initial.viralTerms.es.join("\n"),
  });
  const [nets, setNets] = useState<Net[]>(initial.viralPlatforms);
  const [ignore, setIgnore] = useState(initial.ignoreAuthors);
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
  const perDay = searches * nets.length * perSearch;
  const youtubeClick = searches * perSearch * costs.youtube;

  async function save() {
    setSaving(true);
    setInfo(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupSource,
        viralSource,
        viralPerSearch: perSearch,
        viralTerms: lists,
        viralPlatforms: nets,
        ignoreAuthors: ignore,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    setInfo(res.ok ? "Fontes salvas." : data.error || "Falha ao salvar.");
    if (res.ok) router.refresh();
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Fontes de ideias</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          De onde saem as ideias do job diário. Pode ligar uma, a outra ou as duas.
        </p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={groupSource}
          onChange={(e) => setGroupSource(e.target.checked)}
        />
        <span>
          <strong>Dúvidas do grupo de WhatsApp</strong>
          <span className="block text-sm text-[var(--ink-soft)]">
            Perguntas e polêmicos das mensagens das últimas 24 horas.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={viralSource}
          onChange={(e) => setViralSource(e.target.checked)}
        />
        <span>
          <strong>Vídeos virais (TikTok, Reels e YouTube Shorts)</strong>
          <span className="block text-sm text-[var(--ink-soft)]">
            Busca no Apify os vídeos de impressão 3D que estão indo bem e transforma nos
            melhores em ideias para você gravar.
          </span>
        </span>
      </label>

      <div className="space-y-2 pl-7">
        <p className="text-sm font-medium">Redes na busca diária</p>
        {NETS.map(({ id, label }) => (
          <label key={id} className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={nets.includes(id)}
              onChange={(e) =>
                setNets(e.target.checked ? [...nets, id] : nets.filter((n) => n !== id))
              }
            />
            {label}
            <span className="text-[var(--ink-soft)]">
              · {costs[id] === 0 ? "grátis (API oficial)" : `~${usd(monthly(id))}/mês`}
            </span>
          </label>
        ))}
      </div>

      {!apifyReady && (
        <p className="rounded-xl bg-[var(--warn-soft,#ffedd5)] p-3 text-sm text-[var(--warn)]">
          Falta configurar o APIFY_TOKEN no servidor. Sem ele a busca de vídeos não roda.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Termos de busca (um por linha)</p>
        <div className="grid gap-3 md:grid-cols-3">
          {LANGS.map(({ id, label }) => (
            <label key={id} className="flex flex-col gap-1 text-sm text-[var(--ink-soft)]">
              {label}
              <textarea
                className="field min-h-24 text-sm"
                value={terms[id]}
                onChange={(e) => setTerms({ ...terms, [id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--ink-soft)]">
          No Instagram cada termo vira hashtag (ex.: &quot;impressão 3d&quot; →
          #impressao3d). Os mesmos termos são usados nas ideias para YouTube.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm text-[var(--ink-soft)]">
        Vídeos por busca (em cada rede)
        <input
          type="number"
          min={1}
          max={50}
          className="field max-w-32"
          value={perSearch}
          onChange={(e) => setPerSearch(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--ink-soft)]">
        Perfis ignorados (os seus, separados por vírgula)
        <input
          className="field"
          value={ignore}
          onChange={(e) => setIgnore(e.target.value)}
          placeholder="primeirasimpressoes.3d"
        />
      </label>

      <p className="text-sm text-[var(--ink-soft)]">
        Por dia: {searches} termo(s) × {nets.length} rede(s) × {perSearch} ={" "}
        <strong>{perDay} vídeos</strong>. Custo estimado no Apify:{" "}
        <strong>{usd(perMonth)}/mês</strong> (o plano grátis dá US$ 5/mês). Cada clique em
        &quot;Ideias para YouTube&quot;:{" "}
        {youtubeClick === 0 ? "grátis (API oficial)" : `cerca de ${usd(youtubeClick)}`}.
      </p>
      {!youtubeApiReady && (
        <p className="text-xs text-[var(--ink-soft)]">
          O YouTube está indo pelo Apify. Com a chave da API oficial do YouTube
          (YOUTUBE_API_KEY) ele passa a ser grátis.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Salvando..." : "Salvar fontes"}
        </button>
        {info && <p className="text-sm">{info}</p>}
      </div>
    </section>
  );
}
