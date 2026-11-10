"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Lang = "pt" | "en" | "es";
const LANGS: { id: Lang; label: string }[] = [
  { id: "pt", label: "Português" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
];

export function SourcesPanel({
  initial,
  apifyReady,
  costPerVideo,
}: {
  initial: {
    groupSource: boolean;
    viralSource: boolean;
    viralPerSearch: number;
    viralTerms: Record<Lang, string[]>;
  };
  apifyReady: boolean;
  costPerVideo: number;
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
  // 3 redes (TikTok, Reels, Shorts) por termo, todo dia
  const perDay = searches * 3 * perSearch;
  const perMonth = perDay * 30 * costPerVideo;

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

      <p className="text-sm text-[var(--ink-soft)]">
        Por dia: {searches} termo(s) × 3 redes × {perSearch} = <strong>{perDay} vídeos</strong>.
        Custo estimado no Apify:{" "}
        <strong>
          US$ {perMonth.toFixed(2).replace(".", ",")}/mês
        </strong>{" "}
        (o plano grátis dá US$ 5/mês). Cada clique em &quot;Ideias para YouTube&quot; custa
        cerca de US$ {(searches * perSearch * costPerVideo).toFixed(2).replace(".", ",")}.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? "Salvando..." : "Salvar fontes"}
        </button>
        {info && <p className="text-sm">{info}</p>}
      </div>
    </section>
  );
}
