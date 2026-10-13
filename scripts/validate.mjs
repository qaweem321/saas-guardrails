// Checks the marketplace and plugin against Claude Code's plugin format (what
// `claude plugin validate` checks, for machines without the Claude Code CLI).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The repository root, or another folder to check (used by the tests).
const root = process.argv[2] ?? fileURLToPath(new URL("..", import.meta.url));
const errors = [];
const fail = (message) => errors.push(message);
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path}: invalid JSON (${error.message})`);
    return null;
  }
}

const marketplace = readJson(join(root, ".claude-plugin", "marketplace.json"));
if (marketplace) {
  if (!NAME.test(marketplace.name ?? "")) fail("marketplace.json: name must be kebab-case");
  if (!marketplace.owner?.name) fail("marketplace.json: owner.name is required");
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    fail("marketplace.json: plugins must be a non-empty array");
  }
  for (const [index, entry] of (marketplace.plugins ?? []).entries()) {
    const where = `marketplace.json plugins[${index}]`;
    if (!NAME.test(entry.name ?? "")) fail(`${where}: name must be kebab-case`);
    if (typeof entry.source !== "string" || !entry.source.startsWith("./")) {
      fail(`${where}: source must be a relative path starting with ./`);
      continue;
    }
    if (entry.source.includes("..")) fail(`${where}: source must not contain ".."`);
    checkPlugin(join(root, entry.source), entry.name, where);
  }
}

// The small part of YAML frontmatter skills use: `key: value` lines, where a value may continue on
// indented lines, or start as a block scalar (`description: >`).
function parseFrontmatter(text) {
  const fields = {};
  let key = null;
  for (const line of text.split(/\r?\n/)) {
    const field = line.match(/^([\w-]+):\s*(.*)$/);
    if (field) {
      key = field[1];
      fields[key] = /^[>|][+-]?$/.test(field[2]) ? "" : field[2];
    } else if (key && /^\s+\S/.test(line)) {
      fields[key] = `${fields[key]} ${line.trim()}`.trim();
    }
  }
  return fields;
}

function checkPlugin(dir, entryName, where) {
  if (!existsSync(dir)) return fail(`${where}: source path does not exist: ${dir}`);
  const manifest = readJson(join(dir, ".claude-plugin", "plugin.json"));
  if (!manifest) return;
  if (manifest.name !== entryName) {
    fail(`${where}: plugin.json name "${manifest.name}" differs from the entry name "${entryName}"`);
  }
  if (manifest.version && !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    fail(`${where}: version must look like 1.0.0`);
  }
  const extra = readdirSync(join(dir, ".claude-plugin")).filter((f) => f !== "plugin.json");
  if (extra.length > 0) fail(`${where}: only plugin.json belongs in .claude-plugin/ (${extra})`);

  const skillsDir = join(dir, "skills");
  if (!existsSync(skillsDir)) return fail(`${where}: missing skills/ folder`);
  for (const skill of readdirSync(skillsDir)) {
    const file = join(skillsDir, skill, "SKILL.md");
    if (!existsSync(file)) {
      fail(`skills/${skill}: missing SKILL.md`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    if (!front) {
      fail(`skills/${skill}/SKILL.md: missing frontmatter`);
      continue;
    }
    const fields = parseFrontmatter(front[1]);
    if (fields.name !== skill) fail(`skills/${skill}: frontmatter name must be "${skill}"`);
    if (fields.name && (fields.name.length > 64 || !NAME.test(fields.name))) {
      fail(`skills/${skill}: name must be kebab-case, 64 characters at most`);
    }
    if (!fields.description) fail(`skills/${skill}: description is required`);
    if (fields.description?.length > 1024) fail(`skills/${skill}: description over 1024 chars`);
    const fences = text.match(/^```/gm)?.length ?? 0;
    if (fences % 2 !== 0) fail(`skills/${skill}: unclosed code block`);
    console.log(`  skill ${skill}: ok (${text.length} chars)`);
  }
}

if (errors.length > 0) {
  console.error(`✘ Validation failed\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("✔ Validation passed");
