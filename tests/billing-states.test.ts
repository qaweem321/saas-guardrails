import assert from "node:assert/strict";
import { test } from "node:test";
import { importBlock } from "./snippets.ts";

const { periodNote, hasPaymentProblem } = await importBlock(
  "billing-states",
  "export function periodNote",
);
const currentPeriodEnd = new Date("2026-10-14T23:30:00Z");

test("every status says what happens next", () => {
  const expected: Record<string, [string | null, string | null]> = {
    // status: [not cancelled, cancelled at period end]
    active: ["Renews on Oct 14, 2026.", "Cancelled: Pro ends on Oct 14, 2026, then you're back on Free."],
    trialing: [
      "Free trial ends on Oct 14, 2026.",
      "Cancelled: Pro ends on Oct 14, 2026, then you're back on Free.",
    ],
    past_due: [null, null],
    unpaid: [null, null],
    incomplete: [null, null],
    paused: [null, null],
  };
  for (const [status, [open, cancelled]] of Object.entries(expected)) {
    assert.equal(periodNote({ status, cancelAtPeriodEnd: false, currentPeriodEnd }), open, status);
    assert.equal(
      periodNote({ status, cancelAtPeriodEnd: true, currentPeriodEnd }),
      cancelled,
      `${status} cancelled`,
    );
  }
});

test("a cancelled trial never says the trial simply ends", () => {
  const note = periodNote({ status: "trialing", cancelAtPeriodEnd: true, currentPeriodEnd });
  assert.doesNotMatch(note, /Free trial ends/);
});

test("dates are in UTC, whatever the server's time zone", () => {
  // 23:30 UTC on Oct 14 is already Oct 15 in Asia; the note must still say Oct 14.
  assert.match(periodNote({ status: "active", cancelAtPeriodEnd: false, currentPeriodEnd }), /Oct 14/);
});

test("payment problems are detected", () => {
  for (const status of ["past_due", "unpaid", "incomplete", "paused"]) {
    assert.equal(hasPaymentProblem(status), true, status);
  }
  for (const status of ["active", "trialing", "canceled", null, undefined]) {
    assert.equal(hasPaymentProblem(status), false, String(status));
  }
});
