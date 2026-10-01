import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const MODELS = process.argv.slice(2);
const TARGETS = MODELS.length ? MODELS : ["gpt-5.6-sol"];
const prisma = new PrismaClient();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const topic = await prisma.topic.findFirst({
  where: { status: { not: "discarded" } },
  include: { examples: true },
  orderBy: { score: "desc" },
});

if (!topic) {
  console.log("Nenhum tópico no banco para comparar.");
  process.exit(0);
}

const tone = await readFile(new URL("../tomdevoz.md", import.meta.url), "utf8");
const examples = topic.examples.slice(0, 3).map((e) => e.text);

const system = `Você escreve roteiros de Instagram Reels de ~90 segundos no tom de voz do criador, prontos para teleprompter.

TOM DE VOZ:
${tone}

FORMATAÇÃO: só texto falado, sem markdown, sem rótulos de seção.
ESTILO: direto, sem metáfora forçada.
NOMENCLATURA PT-BR: bico, mesa de impressão (não misturar inglês).
CTA final exatamente um destes:
1) Digite CHAT para entrar no meu grupo de WhatsApp onde falamos sobre impressão 3d.
2) Digite NICHOS para receber um video onde falo os nichos mais rentáveis da impressão 3d.
Máximo ~220 palavras.`;

const user = `Escreva só o texto falado do Reel 90s:

Título: ${topic.title}
Resumo: ${topic.summary}
Exemplos:
${examples.map((e) => `- ${e}`).join("\n") || "- (nenhum)"}
Ideias do criador: ${topic.userNotes?.trim() || "(nenhuma)"}

(Teste de comparação de modelo — sem pesquisa web extra.)`;

console.log("=== TÓPICO ===");
console.log(topic.title);
console.log(topic.summary);
console.log("");

for (const model of TARGETS) {
  const started = Date.now();
  let text = "";
  let usage = null;

  try {
    // GPT-5.x: Responses API costuma ser o caminho mais estável
    if (model.startsWith("gpt-5")) {
      const response = await client.responses.create({
        model,
        instructions: system,
        input: user,
      });
      text = response.output_text?.trim() || "(vazio)";
      usage = response.usage
        ? {
            prompt_tokens: response.usage.input_tokens,
            completion_tokens: response.usage.output_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : null;
    } else {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.55,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      text = completion.choices[0]?.message?.content?.trim() || "(vazio)";
      usage = completion.usage;
    }
  } catch (err) {
    text = `ERRO: ${err instanceof Error ? err.message : String(err)}`;
  }

  const ms = Date.now() - started;

  console.log(`\n========== ${model} (${ms}ms) ==========`);
  if (usage) {
    console.log(
      `tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`,
    );
  }
  console.log("");
  console.log(text);
  console.log("");
}

await prisma.$disconnect();
