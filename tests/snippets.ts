// Loads code examples straight from the SKILL.md files, so the tests check what the docs say.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const skills = new URL("../plugins/saas-guardrails/skills/", import.meta.url);

export function skillText(skill: string) {
  return readFileSync(new URL(`${skill}/SKILL.md`, skills), "utf8");
}

// The fenced code block (```ts or ```sql) in a skill that contains `marker`.
export function codeBlock(skill: string, marker: string) {
  const blocks = [...skillText(skill).matchAll(/```(\w+)\n([\s\S]*?)```/g)];
  const found = blocks.find((block) => block[2].includes(marker));
  if (!found) {
    throw new Error(`No code block with "${marker}" in ${skill}/SKILL.md`);
  }
  return found[2];
}

// Imports a TypeScript block as a module (Node strips the types).
export async function importBlock(skill: string, marker: string) {
  const dir = join(tmpdir(), "saas-guardrails-tests");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${skill}-${Math.abs(hash(marker))}.ts`);
  writeFileSync(file, codeBlock(skill, marker));
  return import(pathToFileURL(file).href);
}

function hash(text: string) {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) | 0;
  return h;
}
