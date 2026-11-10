// Regras "No AI Slop" (inspiradas em no-slop.ai) adaptadas para texto em português,
// mais a voz de conversa (talking head) e um detector para a revisão automática.
// O TOM DE VOZ do criador (tomdevoz.md) manda: expressões dele, como "A sacada é" e
// "A chave aqui é", são permitidas e não entram como slop.

export const NO_SLOP_RULES = `REGRAS ANTI "AI SLOP" (prioridade alta — o texto não pode soar gerado por IA):
- Esforço é a mensagem: cada frase precisa dizer algo concreto. Corte frase que só enche linguiça.
- Volume não é valor: diga em 1 frase o que dá pra dizer em 1 frase. Sem introdução, sem resumo no final.
- PROIBIDAS estas aberturas e muletas: "Você já se perguntou", "Imagine que", "Vamos mergulhar", "No mundo da impressão 3D", "Nos dias de hoje", "Neste vídeo vamos", "Hoje eu vou te ensinar", "Sem mais delongas", "Spoiler:", "A verdade é que", "O segredo é", "E o melhor?", "E pior,", "E aí, já era", "Mas calma", "Fica comigo", "Só isso já", "Resumindo", "No fim das contas".
- PROIBIDAS palavras de IA: "jornada", "desvendar", "mergulhar", "universo de", "potencializar", "alavancar", "elevar ao próximo nível", "game changer", "divisor de águas", "crucial", "fundamental", "essencial" (quando é só enfeite), "incrível", "revolucionário".
- PROIBIDOS ditados e frases prontas: "o barato sai caro", "menos é mais", "quem avisa amigo é", "faz toda a diferença", "simples assim".
- PROIBIDO o padrão "Não é só X, é Y" / "Não é sobre X, é sobre Y" / "pode até parecer X, mas Y".
- PROIBIDO travessão (— ou –) para separar ideias. Use ponto ou vírgula.
- PROIBIDO listas de três adjetivos ou três itens só pelo ritmo ("rápido, fácil e barato").
- PROIBIDO perguntas retóricas em sequência. Uma sacada só no fim (a do criador); não encha de frase de efeito.
- Nada de emoji no texto falado. Nada de exclamação em toda frase.
- Números, nomes de peças e configurações concretas valem mais que adjetivos.`;

/** Talking head: conversa, não aula. */
export const PERSONAL_VOICE = `VOZ (prioridade máxima): CONVERSA DE TALKING HEAD, NÃO AULA
- Ele está olhando pra câmera e conversando, do jeito que responderia um amigo que mandou a dúvida no WhatsApp. É fala, não texto.
- Ele dá a opinião dele e fala em primeira pessoa: "eu uso", "aqui eu faço assim", "eu não faria isso". Fala com "você".
- Frases curtas, uma por respiro, palavras do dia a dia (tô, tá, pra, pro, né, a gente).
- NÃO É AULA: nada de "primeiro... segundo... terceiro", nada de "passo 1", "vamos entender", "existem dois tipos", "é importante saber que". Nada de explicar teoria que ninguém perguntou.
- Uma ideia só. Se tiver passos, ele conta como conversa ("limpa a mesa, baixa a velocidade da primeira camada e testa de novo"), não como lista.
- Sem conectores de redação: "além disso", "por outro lado", "ou seja", "dessa forma", "vale ressaltar", "no entanto", "portanto", "sendo assim".
- Sem suspense fabricado. Disse o que tinha pra dizer, a sacada dele e o CTA.
- Pode falar do que ele faz e usa, mas NÃO invente história com detalhe que você não sabe (data, compra, prejuízo, cliente, "já perdi uma mesa assim").
- Não afirme o que uma marca "recomenda" ou "desaconselha" se isso não estiver no briefing de pesquisa.
- Se algo aqui conflitar com o TOM DE VOZ, vale o TOM DE VOZ (menos inventar fatos).

EXEMPLO — ASSIM NÃO (aula + texto de IA):
"Cola de bastão baratinha pode até parecer solução, mas na Bambu Lab isso é furada. Cola escolar comum tem dois problemas: ou não segura direito, ou gruda demais. E pior, essas colas podem danificar a superfície da mesa. E aí, já era. O barato pode sair caro."

ASSIM SIM (conversa):
"Cola de bastão de papelaria na mesa da Bambu? Eu não uso, cara. Às vezes a peça nem gruda, às vezes gruda tanto que você sofre pra tirar. Antes de pensar em cola, limpa a mesa com álcool isopropílico e baixa a velocidade da primeira camada. Na maioria das vezes é isso que tá faltando. A sacada é: cola é o último recurso, não o primeiro."`;

const SLOP_DASH = /\s+[—–]\s+/g;

/** Limpeza mecânica do que o prompt às vezes deixa passar. */
export function stripSlop(text: string): string {
  return text
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1 a $2")
    .replace(SLOP_DASH, ", ")
    .replace(/[—–]/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ");
}

// Padrões que denunciam texto de IA ou de aula. Cada um vira motivo na revisão automática.
const SLOP_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\bo segredo (é|tá)\b/i, why: "\"o segredo é\"" },
  { re: /\ba verdade é que\b/i, why: "\"a verdade é que\"" },
  { re: /\be pior[,!?]/i, why: "suspense fabricado (\"e pior\")" },
  { re: /\be aí,? já era\b/i, why: "suspense fabricado (\"e aí, já era\")" },
  { re: /\bbarato (pode )?sai(r)? caro\b/i, why: "ditado pronto" },
  { re: /\bmenos é mais\b|\bsimples assim\b|\bfaz toda a diferença\b|\bquem avisa amigo é\b/i, why: "frase pronta" },
  { re: /\bpode até parecer\b[^.]*,\s*mas\b/i, why: "\"pode até parecer X, mas Y\"" },
  { re: /\bnão é (só|sobre|apenas)\b[^.]*,\s*é\b/i, why: "\"não é X, é Y\"" },
  { re: /\bsó isso já\b/i, why: "muleta de reforço (\"só isso já\")" },
  { re: /\b(resumindo|no fim das contas|em resumo)\b/i, why: "resumo no final" },
  { re: /\b(além disso|por outro lado|ou seja|dessa forma|vale ressaltar|no entanto|portanto|sendo assim)\b/i, why: "conector de redação (soa texto, não fala)" },
  { re: /\b(primeiro|segundo|terceiro) (passo|ponto)\b|\bpasso \d\b|\bvamos entender\b|\bexistem (dois|três) tipos\b|\bé importante (saber|lembrar)\b/i, why: "tom de aula" },
  { re: /\btem (dois|três) problemas:/i, why: "tom de aula (enumeração)" },
  { re: /\b(crucial|fundamental|incrível|revolucionári[oa]|jornada|mergulhar|desvendar|potencializar|alavancar)\b/i, why: "palavra de IA" },
  { re: /\b(você já se perguntou|imagine que|fica comigo|mas calma|sem mais delongas|neste vídeo|hoje eu vou te)\b/i, why: "abertura/muleta proibida" },
];

/** Frases do texto que caem em algum padrão de slop, com o motivo. */
export function findSlop(text: string): { sentence: string; why: string }[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hits: { sentence: string; why: string }[] = [];
  for (const sentence of sentences) {
    if (/^digite (chat|nichos)\b/i.test(sentence)) continue;
    const match = SLOP_PATTERNS.find((p) => p.re.test(sentence));
    if (match) hits.push({ sentence, why: match.why });
  }
  return hits;
}
