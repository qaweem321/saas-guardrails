import assert from "node:assert/strict";
import { test } from "node:test";
import { importBlock } from "./snippets.ts";

const { safeNextPath } = await importBlock("auth-flow", "export function safeNextPath");

test("same-site paths are kept", () => {
  assert.equal(safeNextPath("/dashboard/acme/billing"), "/dashboard/acme/billing");
  assert.equal(safeNextPath("/invite/abc?x=1#y"), "/invite/abc?x=1#y");
});

test("other sites and tricks fall back", () => {
  for (const bad of [
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    " //evil.com",
    "evil.com",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(safeNextPath(bad), "/dashboard", String(bad));
  }
});
