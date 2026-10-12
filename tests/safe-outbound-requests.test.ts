import assert from "node:assert/strict";
import { test } from "node:test";
import { importBlock } from "./snippets.ts";

const { isPrivateAddress } = await importBlock(
  "safe-outbound-requests",
  "export function isPrivateAddress",
);

test("hosts rewritten by new URL() are still caught", () => {
  for (const raw of [
    "https://[::ffff:127.0.0.1]/",
    "https://[::ffff:169.254.169.254]/latest/meta-data",
    "https://[::ffff:10.0.0.1]/",
    "https://[::127.0.0.1]/",
    "https://[64:ff9b::7f00:1]/",
    "https://127.1/",
    "https://2130706433/",
    "https://0x7f.1/",
    "https://[::1]/",
    "https://[fe80::1]/",
    "https://[fd00::1]/",
    "https://0.0.0.0/",
    "https://100.64.0.1/",
    "https://192.168.1.10/",
    "https://172.31.255.255/",
  ]) {
    assert.equal(isPrivateAddress(new URL(raw).hostname), true, raw);
  }
});

test("public addresses and names pass the address check", () => {
  for (const raw of [
    "https://8.8.8.8/",
    "https://1.1.1.1/",
    "https://172.32.0.1/",
    "https://[2606:4700::1111]/",
    "https://hooks.slack.com/x",
  ]) {
    assert.equal(isPrivateAddress(new URL(raw).hostname), false, raw);
  }
});

test("a naive regex really misses the rewritten form (why the skill exists)", () => {
  const host = new URL("https://[::ffff:127.0.0.1]/").hostname;
  assert.equal(host, "[::ffff:7f00:1]");
  assert.equal(/^\[?::ffff:(\d+\.\d+\.\d+\.\d+)\]?$/.test(host), false);
});
