import { readFile, writeFile } from "fs/promises";
import path from "path";

const TONE_PATH = path.join(process.cwd(), "tomdevoz.md");

export async function readToneOfVoice(): Promise<string> {
  try {
    return await readFile(TONE_PATH, "utf-8");
  } catch {
    return "Tom direto, claro e conversacional. Gancho forte, problema, 2-3 pontos, CTA.";
  }
}

export async function writeToneOfVoice(content: string): Promise<void> {
  await writeFile(TONE_PATH, content, "utf-8");
}
