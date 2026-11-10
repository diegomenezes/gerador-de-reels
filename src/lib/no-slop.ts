// Regras "No AI Slop" (inspiradas em no-slop.ai) adaptadas para texto em português.
// Entram em todos os prompts que escrevem texto para o público.

export const NO_SLOP_RULES = `REGRAS ANTI "AI SLOP" (prioridade alta — o texto não pode soar gerado por IA):
- Esforço é a mensagem: cada frase precisa dizer algo concreto. Corte frase que só enche linguiça.
- Volume não é valor: diga em 1 frase o que dá pra dizer em 1 frase. Sem introdução, sem resumo no final.
- Escreva como o criador falaria olhando pra câmera, não como um texto de blog ou de assistente.
- PROIBIDAS estas aberturas e muletas: "Você já se perguntou", "Imagine que", "Vamos mergulhar", "No mundo da impressão 3D", "Nos dias de hoje", "Neste vídeo vamos", "Sem mais delongas", "Bora lá", "Spoiler:", "A verdade é que", "E o melhor?", "Mas calma", "Fica comigo".
- PROIBIDAS palavras de IA: "jornada", "desvendar", "mergulhar", "universo de", "potencializar", "alavancar", "elevar ao próximo nível", "game changer", "divisor de águas", "crucial", "fundamental", "essencial" (quando é só enfeite), "incrível", "revolucionário". "Segredo" e "o segredo tá em" são proibidos: diga direto o que faz a diferença.
- PROIBIDO o padrão "Não é só X, é Y" / "Não é sobre X, é sobre Y".
- PROIBIDO travessão (— ou –) para separar ideias. Use ponto ou vírgula.
- PROIBIDO listas de três adjetivos ou três itens só pelo ritmo ("rápido, fácil e barato").
- PROIBIDO perguntas retóricas em sequência e frases de efeito vazias no fim de parágrafo.
- Nada de emoji no texto falado. Nada de exclamação em toda frase.
- Números, nomes de peças e configurações concretas valem mais que adjetivos.`;

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
