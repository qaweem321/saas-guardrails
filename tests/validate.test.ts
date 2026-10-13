// The validator must fail on the mistakes that break real installs, not only pass good plugins.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const script = join(repo, "scripts", "validate.mjs");
const copies: string[] = [];
after(() => {
  for (const dir of copies) rmSync(dir, { recursive: true, force: true });
});

function copyWith(change: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "guardrails-validate-"));
  copies.push(dir);
  cpSync(join(repo, ".claude-plugin"), join(dir, ".claude-plugin"), { recursive: true });
  cpSync(join(repo, "plugins"), join(dir, "plugins"), { recursive: true });
  change(dir);
  return spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
}

const edit = (file: string, from: string, to: string) =>
  writeFileSync(file, readFileSync(file, "utf8").replace(from, to));

test("the real plugin passes", () => {
  assert.equal(copyWith(() => {}).status, 0);
});

test("a skill name that differs from its folder fails", () => {
  const run = copyWith((dir) =>
    edit(join(dir, "plugins/saas-guardrails/skills/audit/SKILL.md"), "name: audit", "name: Audit"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /frontmatter name must be "audit"/);
});

test("an entry name that differs from plugin.json fails", () => {
  const run = copyWith((dir) =>
    edit(join(dir, ".claude-plugin/marketplace.json"), '"name": "saas-guardrails",\n      "source"', '"name": "guardrails",\n      "source"'),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /differs from the entry name/);
});

test("a source path with .. fails", () => {
  const run = copyWith((dir) =>
    edit(join(dir, ".claude-plugin/marketplace.json"), "./plugins/saas-guardrails", "./../plugins/saas-guardrails"),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /must not contain/);
});

const auditSkill = (dir: string) => join(dir, "plugins/saas-guardrails/skills/audit/SKILL.md");

test("Windows line endings pass", () => {
  const run = copyWith((dir) => {
    const file = auditSkill(dir);
    writeFileSync(file, readFileSync(file, "utf8").replace(/\n/g, "\r\n"));
  });
  assert.equal(run.status, 0, run.stderr);
});

test("a multi-line description is read in full, so the length limit still applies", () => {
  const run = copyWith((dir) =>
    edit(auditSkill(dir), "description: ", `description: >\n  ${"word ".repeat(250)}\n  `),
  );
  assert.equal(run.status, 1);
  assert.match(run.stderr, /description over 1024 chars/);
});

test("a missing skills folder is reported, not a crash", () => {
  const run = copyWith((dir) => rmSync(join(dir, "plugins/saas-guardrails/skills"), { recursive: true }));
  assert.equal(run.status, 1);
  assert.match(run.stderr, /missing skills\/ folder/);
  assert.doesNotMatch(run.stderr, /at .*validate\.mjs/);
});
