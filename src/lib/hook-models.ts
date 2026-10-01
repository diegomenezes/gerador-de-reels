import { readFile, writeFile } from "fs/promises";
import path from "path";

const HOOKS_PATH = path.join(process.cwd(), "modelosganchos.md");

const FALLBACK = `# Modelos de ganchos
- Se você não faz X, pode ter problemas
- Configuração secreta para Y
- Pare de fazer X quando Z
`;

export async function readHookModels(): Promise<string> {
  try {
    return await readFile(HOOKS_PATH, "utf-8");
  } catch {
    return FALLBACK;
  }
}

export async function writeHookModels(content: string): Promise<void> {
  await writeFile(HOOKS_PATH, content, "utf-8");
}
