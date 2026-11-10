import OpenAI from "openai";
import { z } from "zod";
import type { CompactMessage } from "./filter";
import { NO_SLOP_RULES, stripSlop } from "./no-slop";

export type IdeaKind = "question" | "polemic" | "viral" | "youtube";

/** Rótulo dos exemplos de cada tipo de ideia nos prompts. */
function examplesLabel(kind?: IdeaKind) {
  if (kind === "viral" || kind === "youtube") {
    return "Vídeos de referência (o que está indo bem nas redes)";
  }
  return "Exemplos reais do grupo";
}

/** Clustering, pesquisa web, legendas — barato e rápido */
const MODEL_FAST = process.env.OPENAI_MODEL || "gpt-4o-mini";
/** Roteiros e ganchos — melhor qualidade de escrita */
const MODEL_QUALITY =
  process.env.OPENAI_MODEL_QUALITY || "gpt-4.1";

/** PT-BR consistente — sem misturar com inglês nas peças. */
const NOMENCLATURE_RULES = `NOMENCLATURA (obrigatório):
- Use SEMPRE português do Brasil nos nomes das peças e ações.
- NÃO misture PT com EN (errado: "build plate", "nozzle", "placa/build plate", "bico/nozzle").
- Glossário padrão:
  - bico (nunca Nozzle / nozzle)
  - mesa de impressão (nunca Build Plate / build plate)
  - hotend só se for inevitável no ecossistema; prefira descrever em PT quando der ("conjunto do hotend")
  - filamento, carretel
  - extrusor, ventilador, sensor de filamento
- Nomes próprios de marca/produto podem ficar: Bambu Lab, Bambu Studio, AMS, AMS Lite
- Menus do Bambu Studio: diga em português o que a pessoa faz ("em Configurações de calibração...") e só cite o nome em inglês do menu se for o rótulo oficial da tela — sem ficar alternando o nome da peça.`;

/** Evita conselhos de impressora antiga no contexto Bambu. */
const BAMBU_CONTEXT_RULES = `ECOSSISTEMA BAMBU (obrigatório):
- NÃO fale de Z-offset / Z offset / ajuste manual de Z como solução comum
- Na Bambu Lab a mesa calibra automaticamente; Z-offset é problema típico de impressoras mais antigas
- Em aderência de primeira camada, foque em: limpeza da mesa, temperatura da mesa, velocidade da 1ª camada, brim/saia, tipo de superfície, umidade do filamento, fluxo/calibração automática da máquina
- Se alguém citar Z-offset na dúvida, explique que na Bambu isso quase não é o caminho e redirecione pro fluxo automático + limpeza/temp/velocidade`;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada");
  }
  return new OpenAI({ apiKey });
}

const ClusterSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      frequency: z.number().int().positive(),
      score: z.number().min(0).max(100),
      examples: z.array(z.string()).min(1).max(5),
    }),
  ),
});

export type ClusteredTopic = z.infer<typeof ClusterSchema>["topics"][number];

function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : content;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Resposta da IA sem JSON válido");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

export type CoveredTheme = { title: string; summary: string };

function coveredThemesBlock(themes: CoveredTheme[]): string {
  if (themes.length === 0) return "";
  const lines = themes
    .slice(0, 80)
    .map((theme) => `- ${theme.title}: ${theme.summary}`)
    .join("\n");
  return `
Temas que JÁ têm roteiro ou já foram gravados. Não crie de novo, nem com outras palavras:
${lines}
`;
}

export async function clusterDoubts(
  messages: CompactMessage[],
  topN = 15,
  covered: CoveredTheme[] = [],
): Promise<ClusteredTopic[]> {
  if (messages.length === 0) return [];

  const client = getClient();
  const catalog = messages
    .map((m, i) => `${i + 1}. [${m.count}x] ${m.text}`)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: MODEL_FAST,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você extrai ideias de Reels a partir de mensagens de WhatsApp. Cada tópico = UM Reel específico. Responda só JSON válido.",
      },
      {
        role: "user",
        content: `Transforme as mensagens abaixo em até ${topN} ideias de Reel (dúvidas/problemas).

Regra de ouro — SEPARAR, não juntar por tema genérico:
- Só una mensagens se forem a MESMA pergunta com palavras diferentes.
- Se a resposta/solução do Reel for diferente, são tópicos SEPARADOS.
- Mesmo assunto amplo (ex.: filamento) NÃO justifica juntar.

Exemplos que DEVEM ficar separados:
1) "Carretel todo bagunçado, como organizar?" → Reel de organização de carretel
2) "Tem que proteger filamento do sol?" → Reel de armazenamento/proteção UV
3) "Como usar moldes para derreter filamento?" → Reel de reciclagem/moldes
NÃO criar um único tópico "dúvidas de filamento".

Outras regras:
- Foque em dúvidas/problemas reais (ignore conversa fiada, ok, kkk, obrigado)
- title = específico o bastante pra gravar um Reel sem misturar assuntos
- summary = 1-2 frases sobre AQUELA dúvida só
- frequency = soma das ocorrências daquela pergunta específica
- score = potencial de Reel (0-100): clareza + utilidade + recorrência
- examples = 1 a 3 trechos reais curtos DAQUELA dúvida
${coveredThemesBlock(covered)}
Formato:
{
  "topics": [
    {
      "title": "string curta e específica",
      "summary": "1-2 frases",
      "frequency": 3,
      "score": 80,
      "examples": ["..."]
    }
  ]
}

Mensagens:
${catalog}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo no clustering");

  const parsed = ClusterSchema.parse(extractJson(content));
  return parsed.topics
    .sort((a, b) => b.score - a.score || b.frequency - a.frequency)
    .slice(0, topN);
}

export async function clusterPolemics(
  messages: CompactMessage[],
  topN = 8,
  covered: CoveredTheme[] = [],
): Promise<ClusteredTopic[]> {
  if (messages.length === 0) return [];

  const client = getClient();
  const catalog = messages
    .map((m, i) => `${i + 1}. [${m.count}x] ${m.text}`)
    .join("\n");

  const completion = await client.chat.completions.create({
    model: MODEL_FAST,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você caça ideias de Reels polêmicos em conversas de WhatsApp. Responda só JSON válido. Não invente assunto que não esteja nas mensagens.",
      },
      {
        role: "user",
        content: `Das mensagens abaixo, extraia até ${topN} ideias de Reel que podem viralizar. NÃO são tutoriais.

Procure só isto:
- alguém falando mal de produto, marca, prática ou pessoa
- notícia ou "cês viram isso?" que gerou reação
- discussão com lados opostos
- reclamação que divide a galera (licença, vender peça proibida, saúde, incêndio, preço, hype)

IGNORE dúvida técnica pura ("como calibro", "qual temperatura"). Isso não é polêmica.

O title é a primeira frase falada do Reel, curta e provocativa, no tom destes exemplos:
- "Cê baixou no MakerWorld e tá vendendo? Lê a licença."
- "Para de vender cortador de biscoito em PLA sem avisar isso."
- "Quem começou na Bambu Lab não sabe imprimir."
- "Comenta a marca de filamento que você nunca mais compra."

Formatos permitidos:
1) alerta que divide opinião
2) opinião impopular, com UM lado
3) isca de comentário

Regras:
- Uma briga = um Reel. Não junte assuntos diferentes.
- Se não houver matéria polêmica de verdade, devolva "topics": []
- summary = o que aconteceu no grupo e qual lado o vídeo defende
- frequency = quantas mensagens sustentam aquilo
- score = potencial de comentário e de dividir opinião (0-100), não utilidade de tutorial
- examples = 1 a 3 trechos REAIS curtos. Não parafraseie como se fosse citação.
${coveredThemesBlock(covered)}
Formato:
{
  "topics": [
    {
      "title": "frase falada do gancho",
      "summary": "1-2 frases",
      "frequency": 3,
      "score": 85,
      "examples": ["..."]
    }
  ]
}

Mensagens:
${catalog}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou as polêmicas");

  const parsed = ClusterSchema.parse(extractJson(content));
  return parsed.topics
    .sort((a, b) => b.score - a.score || b.frequency - a.frequency)
    .slice(0, topN);
}

async function researchTopicFacts(input: {
  title: string;
  summary: string;
  examples: string[];
  kind?: IdeaKind;
}): Promise<string> {
  const client = getClient();
  const researchPrompt = `Pesquise na internet (obrigatório) se esta dúvida de impressão 3D faz sentido na prática e quais são os fatos corretos.

FOCO OBRIGATÓRIO:
- Ecossistema Bambu Lab (impressoras, filamentos, AMS, Hotend, etc.)
- Software Bambu Studio (nomes de menus, recursos, fluxos e termos oficiais)
- Usar nomenclatura correta da Bambu Lab / Bambu Studio
- Corrigir mitos comuns e evitar recomendações erradas

${NOMENCLATURE_RULES}

${BAMBU_CONTEXT_RULES}

No item "O que NÃO falar", inclua explicitamente Z-offset se o tema for aderência/primeira camada/mesa.

Dúvida:
Título: ${input.title}
Resumo: ${input.summary}
${examplesLabel(input.kind)}:
${input.examples.map((e) => `- ${e}`).join("\n")}

Devolva um briefing técnico objetivo em português com:
1) O problema real (se a dúvida faz sentido)
2) Glossário em PT-BR a usar no roteiro (sem termos EN de peça)
3) Passos/solução verificáveis
4) O que NÃO falar (erros comuns + misturas PT/EN a evitar)
5) Fontes ou páginas oficiais quando possível
Seja específico e curto.`;

  const toolVariants = [{ type: "web_search" as const }, { type: "web_search_preview" as const }];
  let lastError: Error | null = null;

  for (const tool of toolVariants) {
    try {
      const response = await client.responses.create({
        model: MODEL_FAST,
        tools: [tool],
        tool_choice: "auto",
        input: researchPrompt,
      });

      const text =
        (response as { output_text?: string }).output_text?.trim() ||
        extractResponsesText(response);

      if (text) return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    lastError?.message ||
      "Falha ao pesquisar na internet antes de gerar o roteiro",
  );
}

function extractResponsesText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof (part as { text: unknown }).text === "string"
      ) {
        chunks.push((part as { text: string }).text);
      }
    }
  }
  return chunks.join("\n").trim();
}

const MAX_HOOK_CHARS = 65;

const HooksSchema = z.object({
  hooks: z.array(z.string().min(3)).min(3).max(8),
});

export async function generateHookSuggestions(input: {
  title: string;
  summary: string;
  examples: string[];
  hookModels: string;
  polemic?: boolean;
  kind?: IdeaKind;
}): Promise<string[]> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL_QUALITY,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você cria ganchos fortes para a primeira frase/legenda de Reels no Instagram.
Use os MODELOS DE GANCHOS como base de estruturas (adapte, não copie genérico sem contexto).
Foque no tema específico. Português do Brasil. Sem markdown.
${input.polemic ? "Este Reel é POLÊMICO: cada gancho tem que dividir opinião ou puxar comentário. Uma frase, um lado só. Sem tutorial." : input.kind === "youtube" ? "Estes ganchos são TÍTULOS de vídeo longo no YouTube: curiosidade + benefício claro. Sem clickbait mentiroso, sem CAIXA ALTA inteira." : input.kind === "viral" ? "Esta ideia veio de vídeos que estão indo bem nas redes (inclusive fora do Brasil). O gancho é a promessa do vídeo, adaptada pro público brasileiro." : "Foque na dúvida prática."}
${NO_SLOP_RULES}
PROIBIDO metáfora/analogia forçada ("tipo palito de dente", "como sabão", "mais ... que ...").
Direto e concreto: diga o problema real, sem comparar com objetos.
${NOMENCLATURE_RULES}
LIMITE RÍGIDO: cada gancho deve ter NO MÁXIMO ${MAX_HOOK_CHARS} caracteres (incluindo espaços).
Se ficar longo, reescreva mais curto — nunca ultrapasse ${MAX_HOOK_CHARS}.
Responda só JSON: { "hooks": ["...", "..."] }`,
      },
      {
        role: "user",
        content: `Crie 5 ganchos fortes e específicos para este Reel (cada um com no máximo ${MAX_HOOK_CHARS} caracteres):

Tema: ${input.title}
Resumo: ${input.summary}
${examplesLabel(input.kind)}:
${input.examples.map((e) => `- ${e}`).join("\n")}

MODELOS DE GANCHOS (base de ideias/estruturas):
${input.hookModels.slice(0, 12000)}

Exemplos do estilo desejado (curtos):
- Se você não calibra após trocar o bico, dá ruim
- Configuração secreta pra trocar o bico`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou os ganchos");

  const parsed = HooksSchema.parse(extractJson(content));
  return parsed.hooks
    .map((h) => stripSlop(h.replace(/\*\*/g, "")).trim())
    .filter(Boolean)
    .map(clampHookLength)
    .filter((h) => h.length >= 3);
}

function clampHookLength(hook: string): string {
  if (hook.length <= MAX_HOOK_CHARS) return hook;
  const sliced = hook.slice(0, MAX_HOOK_CHARS);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced).trim();
}

export async function generateInstagramCaption(input: {
  title: string;
  summary: string;
  scriptContent: string;
  tone: string;
  hooks: string[];
  kind?: IdeaKind;
}): Promise<string> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: MODEL_FAST,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `${input.kind === "youtube" ? "Você escreve a DESCRIÇÃO de um vídeo longo do YouTube no tom do criador (as regras abaixo valem igual, com 3 a 6 frases)." : "Você escreve legendas de Instagram (Reels) no tom do criador."}

TOM DE VOZ:
${input.tone}

Regras:
- Português do Brasil, oral e direto
- 2 a 5 frases curtas + linha em branco + exatamente 3 hashtags
- Sem markdown, sem emojis em excesso (no máximo 1 se couber natural)
- Não invente links
- Termine a legenda com as 3 hashtags na última linha, separadas por espaço
- Hashtags relevantes ao tema (impressão 3D / Bambu quando fizer sentido)
- Não use mais nem menos que 3 hashtags
${NOMENCLATURE_RULES}
${NO_SLOP_RULES}`
      },
      {
        role: "user",
        content: `Crie a legenda do post no Instagram para este Reel:

Tema: ${input.title}
Resumo: ${input.summary}
Ganchos sugeridos:
${input.hooks.map((h) => `- ${h}`).join("\n") || "- (nenhum)"}

Roteiro falado:
${input.scriptContent}

Devolva só a legenda pronta para colar.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI não retornou a legenda");

  // Não usar /^#\s+/ aqui — isso apagaria linhas de hashtag do Instagram
  return stripSlop(content.replace(/\*\*/g, "")).trim();
}

export async function generateReelScript(input: {
  title: string;
  summary: string;
  examples: string[];
  tone: string;
  userNotes?: string;
  kind?: IdeaKind;
}): Promise<{ content: string; model: string }> {
  if (input.kind === "youtube") return generateYoutubeOutline(input);
  const client = getClient();
  const research = await researchTopicFacts(input);

  const completion = await client.chat.completions.create({
    model: MODEL_QUALITY,
    temperature: 0.55,
    messages: [
      {
        role: "system",
        content: `Você escreve roteiros de Instagram Reels de ~90 segundos no tom de voz do criador, prontos para teleprompter.

TOM DE VOZ:
${input.tone}

${
  input.kind === "polemic"
    ? `FORMATO POLÊMICO (prioridade alta):
- A primeira frase É o gancho: provocação, alerta ou opinião impopular
- Escolha UM lado. Não faça "os dois lados têm razão"
- Use os trechos reais do grupo como prova. Não invente notícia, marca, caso ou briga que não está nos exemplos
- Se a pesquisa mostrar que o que o grupo está falando é mito, o lado do vídeo é desmentir, sem repetir o mito como verdade
- No meio, pode chamar comentário ("comenta a marca...", "conta o susto que você já levou")
- Não vire tutorial passo a passo
- Anti-guru, pé no chão`
    : input.kind === "viral"
      ? `FORMATO VIRAL ADAPTADO (prioridade alta):
- A ideia veio de vídeos que estão indo bem no TikTok, Reels ou Shorts, alguns em inglês ou espanhol
- NÃO traduza nem copie o vídeo de referência: pegue o que fez ele funcionar e faça a versão do criador, pro público brasileiro
- Tem que ser algo que o criador consegue gravar com a impressora dele
- Não cite o vídeo, o perfil nem a rede de onde veio
- Fluxo interno (NÃO escreva os rótulos): gancho forte → o que a pessoa vai ver → por que funciona → CTA`
      : `Fluxo interno (NÃO escreva esses rótulos no texto final):
gancho → problema → solução em 2-3 pontos → CTA`
}

FORMATAÇÃO DO OUTPUT (obrigatório):
- Texto para ler em voz alta, em PARÁGRAFOS CURTOS
- OBRIGATÓRIO: separar ideias com linha em branco (não entregue um bloco único)
- Ideal: 1–3 frases por parágrafo; uma ideia por bloco
- SEM markdown (nada de **, #, -, listas, backticks)
- SEM títulos de seção tipo "GANCHO", "PROBLEMA", "SOLUÇÃO", "CTA"
- SEM marcações de tempo tipo "(0-5s)"
- SEM "NOTAS TÉCNICAS" ou qualquer bloco extra
- Só o que será falado no vídeo

ESTILO — PROIBIDO metáfora / analogia forçada (prioridade alta):
- NUNCA use "tipo X", "como se fosse", "mais ... que", "tão ... quanto" com objetos aleatórios
- PROIBIDO: palito de dente, sabão, chuva, comida, clima, borracha, papel, vidro, etc. pra "ilustrar"
- ERRADO: "a peça sai frágil, tipo palito de dente" / "aderência pior que sabão"
- CERTO: "a peça sai frágil e quebra fácil" / "a peça não gruda na mesa e solta"
- Descreva o problema e a consequência prática, sem comparação com objetos
- Anti-hype, pé no chão, mentor-parceiro

Regras de precisão (prioridade máxima):
- Use o BRIEFING DE PESQUISA abaixo como fonte da verdade
- Prefira nomenclatura oficial em PT-BR (bico, mesa de impressão) — sem misturar inglês
- Não invente menus, botões, temperaturas, recursos ou nomes de peças
- Se o briefing disser que algo é mito/errado, NÃO recomende
- Se faltar certeza em um detalhe, use linguagem cautelosa
- Foque o ecossistema Bambu quando fizer sentido
- Se houver IDEIAS DO CRIADOR, priorize incorporar esses pontos no roteiro (com as palavras dele quando der, no tom dele)
${NOMENCLATURE_RULES}
${BAMBU_CONTEXT_RULES}

CTA FINAL OBRIGATÓRIO (escolha EXATAMENTE um, palavra por palavra):
1) Digite CHAT para entrar no meu grupo de WhatsApp onde falamos sobre impressão 3d.
2) Digite NICHOS para receber um video onde falo os nichos mais rentáveis da impressão 3d.

Como escolher:
- Use NICHOS se o tema for dinheiro, vender, nicho, produto pra vender, rentabilidade
- Use CHAT nos demais casos (técnico, configuração, filamento, Bambu, calibração, etc.)
- Pode fazer uma frase de ponte curta antes, mas o fechamento TEM que ser uma das duas frases acima, intacta
- Nunca invente outro CTA (salvar, seguir, curtir, etc.)

Outras regras:
- Português do Brasil
- Texto falado, natural
- Seja específico e útil
- Máximo ~220 palavras

${NO_SLOP_RULES}`,
      },
      {
        role: "user",
        content: `Escreva só o texto falado do Reel 90s (teleprompter limpo):

Título: ${input.title}
Resumo: ${input.summary}
${examplesLabel(input.kind)}:
${input.examples.map((e) => `- ${e}`).join("\n")}

IDEIAS DO CRIADOR (prioridade alta — use no roteiro):
${input.userNotes?.trim() || "(nenhuma ideia extra)"}

BRIEFING DE PESQUISA (internet / Bambu Lab / Bambu Studio):
${research}

LEMBRETE FINAL: zero metáfora/analogia com objetos (nada de "tipo palito de dente"). Fale direto. Use parágrafos curtos com linha em branco entre eles. Não mencione Z-offset.
${input.kind === "polemic" ? "Este é um Reel POLÊMICO: um lado só, comentário no meio, CTA CHAT ou NICHOS só no final." : ""}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI não retornou o roteiro");

  return {
    content: ensureFixedCta(
      stripSlop(stripForcedMetaphors(cleanTeleprompterText(content))),
      input.title,
      input.summary,
    ),
    model: MODEL_QUALITY,
  };
}

const CTA_CHAT =
  "Digite CHAT para entrar no meu grupo de WhatsApp onde falamos sobre impressão 3d.";
const CTA_NICHOS =
  "Digite NICHOS para receber um video onde falo os nichos mais rentáveis da impressão 3d.";

function pickCta(title: string, summary: string): string {
  const text = `${title} ${summary}`.toLowerCase();
  const nicheHints =
    /nicho|vender|venda|dinheiro|rent[aá]vel|fatur|produto pra vender|lucr/;
  return nicheHints.test(text) ? CTA_NICHOS : CTA_CHAT;
}

function ensureFixedCta(content: string, title: string, summary: string): string {
  const cta = pickCta(title, summary);
  const normalized = content.replace(/\s+/g, " ").trim().toLowerCase();
  if (
    normalized.includes(CTA_CHAT.toLowerCase()) ||
    normalized.includes(CTA_NICHOS.toLowerCase())
  ) {
    return content.trim();
  }
  return `${content.trim()}\n\n${cta}`;
}

function cleanTeleprompterText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(
      /^\s*\d+\)\s*(GANCHO|PROBLEMA|SOLU[CÇ][AÃ]O|CTA).*$/gim,
      "",
    )
    .replace(/^\s*(GANCHO|PROBLEMA|SOLU[CÇ][AÃ]O|CTA)\b.*$/gim, "")
    .replace(/\(\d+\s*[-–]\s*\d+s\)/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Remove trechos de metáfora forçada que o modelo às vezes ainda cola. */
function stripForcedMetaphors(text: string): string {
  return text
    .replace(
      /,?[ \t]*tipo\s+(?:um\s+|uma\s+)?(?:palito\s+de\s+dente|sab[aã]o(?:\s+em\s+dia\s+de\s+chuva)?|borracha|papel|vidro|palito)[^.,!?\n]*/gi,
      "",
    )
    .replace(
      /,?[ \t]*(?:mais|t[aã]o)\s+\w+(?:\s+\w+){0,3}\s+(?:do\s+que|que|quanto)\s+(?:um\s+|uma\s+)?(?:palito\s+de\s+dente|sab[aã]o|borracha|papel|vidro)[^.,!?\n]*/gi,
      "",
    )
    // limpa só espaços horizontais — NÃO colapsar \n (quebra o teleprompter)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- Ideias a partir de vídeos que estão indo bem (TikTok, Reels, Shorts, YouTube) ---

const ViralIdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().min(3),
      summary: z.string().min(3),
      score: z.number().min(0).max(100),
      sources: z.array(z.number().int()).min(1).max(5),
    }),
  ),
});

export type ViralIdea = z.infer<typeof ViralIdeasSchema>["ideas"][number];

export type ViralVideoInput = {
  platform: string;
  language: string;
  views: number;
  likes: number;
  caption: string;
};

export async function generateViralIdeas(
  videos: ViralVideoInput[],
  max: number,
  covered: CoveredTheme[],
  format: "short" | "long",
): Promise<ViralIdea[]> {
  if (videos.length === 0) return [];
  const client = getClient();
  const catalog = videos
    .map(
      (v, i) =>
        `${i + 1}. [${v.platform} · ${v.views} views · ${v.likes} likes] ${v.caption.replace(/\s+/g, " ").slice(0, 300)}`,
    )
    .join("\n");

  const formatRules =
    format === "long"
      ? `Formato: VÍDEO LONGO de YouTube (8 a 20 minutos) para o canal do criador.
- Cada ideia tem que render um vídeo inteiro: teste, comparação, projeto do começo ao fim, guia completo, desafio
- title = título do vídeo no YouTube, em português, até 70 caracteres`
      : `Formato: vídeo CURTO (Reels/Shorts/TikTok, até 90 segundos).
- Cada ideia é UM vídeo com uma coisa só: uma peça, um truque, um antes/depois, um teste rápido
- title = a primeira frase falada do vídeo (o gancho), em português, curta`;

  const completion = await client.chat.completions.create({
    model: MODEL_QUALITY,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Você é o produtor de um criador brasileiro de impressão 3D (ecossistema Bambu Lab). Você olha vídeos que estão indo bem em várias redes e idiomas e tira ideias que ELE pode gravar. Responda só JSON válido.`,
      },
      {
        role: "user",
        content: `Abaixo estão vídeos de impressão 3D que estão indo bem (TikTok, Reels, Shorts, YouTube), em português, inglês e espanhol.
Crie até ${max} ideias de vídeo para o criador gravar.

${formatRules}

Regras:
- Procure o PADRÃO que fez os vídeos funcionarem (formato, tipo de peça, curiosidade, erro, resultado visual) e não só o assunto
- Ideia nova pro público brasileiro: não é tradução do vídeo de lá
- Tem que ser gravável por um criador com impressora Bambu Lab em casa
- Junte vídeos parecidos numa ideia só; ideias diferentes não podem ser o mesmo vídeo com outras palavras
- Prefira o que tem mais views e likes, mas um vídeo menor com formato muito bom também vale
- summary = 2 frases: o que o vídeo mostra e por que deve funcionar (cite o padrão que você viu)
- score = potencial de viralizar no Brasil (0-100)
- sources = números (da lista) dos vídeos que inspiraram a ideia, do mais forte pro mais fraco
${coveredThemesBlock(covered)}
${NO_SLOP_RULES}

Formato:
{ "ideas": [ { "title": "...", "summary": "...", "score": 80, "sources": [3, 7] } ] }

Vídeos:
${catalog}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou as ideias dos vídeos");
  const parsed = ViralIdeasSchema.parse(extractJson(content));
  return parsed.ideas
    .map((idea) => ({
      ...idea,
      title: stripSlop(idea.title).trim(),
      summary: stripSlop(idea.summary).trim(),
      sources: idea.sources.filter((n) => n >= 1 && n <= videos.length),
    }))
    .filter((idea) => idea.sources.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** Estrutura de vídeo longo do YouTube (não é teleprompter de Reel). */
async function generateYoutubeOutline(input: {
  title: string;
  summary: string;
  examples: string[];
  tone: string;
  userNotes?: string;
}): Promise<{ content: string; model: string }> {
  const client = getClient();
  const research = await researchTopicFacts({ ...input, kind: "youtube" });

  const completion = await client.chat.completions.create({
    model: MODEL_QUALITY,
    temperature: 0.55,
    messages: [
      {
        role: "system",
        content: `Você monta a estrutura de vídeos longos (8 a 20 minutos) para o canal de YouTube de um criador de impressão 3D, no tom de voz dele.

TOM DE VOZ:
${input.tone}

Entregue exatamente nesta ordem, em texto simples (sem markdown, sem ** nem #), com uma linha em branco entre os blocos:

TÍTULOS
3 opções de título, uma por linha, até 70 caracteres cada.

THUMBNAIL
1 a 2 frases: o que aparece na imagem e o texto curto (até 4 palavras) da thumb.

ABERTURA (primeiros 30 segundos, texto falado)
O texto que ele fala na abertura: promessa clara do vídeo e por que ficar até o fim. Sem "fala pessoal, tudo bem".

CAPÍTULOS
De 4 a 7 capítulos. Para cada um: "1. Nome do capítulo" e embaixo 2 a 4 linhas do que mostrar e falar (o que gravar, o que imprimir, o que medir ou comparar).

FECHAMENTO
2 a 3 frases faladas para fechar, com o CTA: Digite CHAT nos comentários para entrar no meu grupo de WhatsApp onde falamos sobre impressão 3d.

Regras:
- Português do Brasil
- Use o BRIEFING DE PESQUISA como fonte da verdade; não invente menus, temperaturas ou recursos
- A ideia veio de vídeos de referência; não copie, faça a versão do criador
- Se houver IDEIAS DO CRIADOR, use
${NOMENCLATURE_RULES}
${BAMBU_CONTEXT_RULES}

${NO_SLOP_RULES}`,
      },
      {
        role: "user",
        content: `Monte a estrutura do vídeo longo:

Título da ideia: ${input.title}
Resumo: ${input.summary}
${examplesLabel("youtube")}:
${input.examples.map((e) => `- ${e}`).join("\n")}

IDEIAS DO CRIADOR:
${input.userNotes?.trim() || "(nenhuma ideia extra)"}

BRIEFING DE PESQUISA:
${research}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenAI não retornou a estrutura do vídeo");
  return {
    content: stripSlop(
      content
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\n{3,}/g, "\n\n"),
    ).trim(),
    model: MODEL_QUALITY,
  };
}

export {
  MODEL_FAST as OPENAI_MODEL_NAME,
  MODEL_QUALITY as OPENAI_MODEL_QUALITY_NAME,
};
