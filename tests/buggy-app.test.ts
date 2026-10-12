// The sample app's planted bugs must stay real, or the audit demo proves nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { periodNote } from "../examples/buggy-app/lib/billing.ts";

const app = new URL("../examples/buggy-app/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, app), "utf8");

test("bug 1: the webhook regex lets IPv6-mapped private addresses through", () => {
  const source = read("app/webhooks/actions.ts").match(/const PRIVATE = (\/.*\/);/)?.[1];
  assert.ok(source, "PRIVATE regex not found");
  const PRIVATE = new Function(`return ${source}`)() as RegExp;
  for (const raw of ["https://[::ffff:127.0.0.1]/", "https://[::ffff:169.254.169.254]/"]) {
    assert.equal(PRIVATE.test(new URL(raw).hostname), false, raw);
  }
});

test("bug 3: the deposit idempotency key never changes between attempts", () => {
  assert.match(read("lib/deposits.ts"), /idempotencyKey: `deposit-\$\{bookingId\}`/);
});

test("bug 6: a cancelled trial and a failed payment get the wrong sentence", () => {
  const currentPeriodEnd = new Date("2026-10-11T12:00:00Z");
  assert.match(
    periodNote({ status: "trialing", cancelAtPeriodEnd: true, currentPeriodEnd }),
    /^Free trial ends/,
  );
  assert.match(
    periodNote({ status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd }),
    /^Renews on/,
  );
});

test("bug 7: next is used without a check", () => {
  const form = read("app/login/login-form.tsx");
  assert.match(form, /router\.push\(next\)/);
  assert.doesNotMatch(form, /safeNextPath/);
});

test("the audit checklist covers every planted bug", () => {
  const audit = readFileSync(
    new URL("../plugins/saas-guardrails/skills/audit/SKILL.md", import.meta.url),
    "utf8",
  );
  for (const check of [
    "[::ffff:127.0.0.1]", // 1 SSRF
    "File IDs from forms", // 2 files
    "Idempotency keys", // 3 deposits
    "Duplicate subscriptions", // 4 checkout
    "Repeatable free trials", // 4 trials
    "last owner/admin", // 5 race
    "Renews on", // 6 wording
    "`?next=` validated", // 7 redirect
    "back button after logout", // 7 history
  ]) {
    assert.ok(audit.includes(check), check);
  }
});
