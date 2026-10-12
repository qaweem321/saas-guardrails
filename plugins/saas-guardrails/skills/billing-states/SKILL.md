---
name: billing-states
description: Use when writing or changing subscription billing (Stripe, Polar, Paddle, Lemon Squeezy) - plan checks, checkout, cancel, trial, failed payments, billing page wording, webhooks. Makes every billing message match the real subscription state and blocks duplicate subscriptions on the server.
---

# Billing states that tell the truth

Billing bugs rarely crash. They show the wrong sentence, charge twice, or keep charging after the
customer thinks they're gone. Each rule below comes from a bug found in a real product.

## 1. Map every provider status, not just the happy ones

Write one pure module (for example `lib/billing/plans.ts`) that turns a provider status into
everything the UI needs. Never compare status strings in components.

| Status | Plan features | Warning | "Upgrade" allowed | Still charges? |
| --- | --- | --- | --- | --- |
| `trialing` | Paid | none | no | yes, at trial end |
| `active` | Paid | none | no | yes |
| `past_due` | Off (or grace period, your choice, but decide) | "Your last payment failed." | no: offer "Manage subscription" | yes, retries |
| `unpaid` | Off | "Your last payment failed." | no | yes, until cancelled |
| `incomplete` | Off | "Your first payment didn't go through." | no | no (expires ~23h) |
| `paused` (Stripe: trial ended without a card) | Off | "Pro is paused: the trial ended without a card." | no | no |
| `canceled`, `incomplete_expired` | Free | none | yes | no |
| none | Free | none | yes | no |

`cancel_at_period_end = true` is not a status. It's a flag on `trialing`/`active`, and it changes
the wording (below) and the "still charges?" answer to no.

## 2. Wording must describe what happens next

Write one function, such as `periodNote(subscription)`, for the sentence next to the plan name, and
unit-test it for **every** row of the table, with and without `cancelAtPeriodEnd`.

- Active: `Renews on Oct 14, 2026.`
- Trialing: `Free trial ends on Oct 14, 2026.`
- Cancelled (also during a trial): `Cancelled: Pro ends on Oct 14, 2026, then you're back on Free.`
  Never `Free trial ends on ...` after a cancel: it reads as if the cancel didn't work.
- Payment problem: **no renewal date at all**. `Renews on ...` next to `Your last payment failed`
  contradicts itself.

A reference version (adapt the plan names):

```ts
const PAYMENT_PROBLEMS = ["past_due", "unpaid", "incomplete", "paused"];

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function hasPaymentProblem(status: string | null | undefined) {
  return Boolean(status && PAYMENT_PROBLEMS.includes(status));
}

export function periodNote(s: { status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: Date | null }) {
  if (!s.currentPeriodEnd || hasPaymentProblem(s.status)) return null;
  const date = formatDate(s.currentPeriodEnd);
  if (s.cancelAtPeriodEnd) return `Cancelled: Pro ends on ${date}, then you're back on Free.`;
  return s.status === "trialing" ? `Free trial ends on ${date}.` : `Renews on ${date}.`;
}
```

Dates: unambiguous (`Oct 14, 2026`, never `10/14/2026`) and in one fixed time zone (UTC) on server
and client, or hydration will flip them.

## 3. Never start a second subscription

The check that a subscription already exists must run **on the server**, in the checkout action,
and must ask the **provider**, not only your database. The webhook that writes your database can
arrive seconds after the payment, or never.

```ts
// checkout action (server)
const live = await syncSubscriptionFromProvider(orgId); // fetch from Stripe/Polar, upsert, return
if (isPaid(live?.status) || hasPaymentProblem(live?.status)) {
  return { error: "This workspace already has a subscription. Use Manage subscription." };
}
```

Also close the race of two open checkout tabs. With Stripe, expire the customer's other open
Checkout Sessions before creating a new one:

```ts
const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
await Promise.all(open.data.map((s) => stripe.checkout.sessions.expire(s.id)));
```

A payment-problem status shows **Manage subscription** (update the card), never **Upgrade**.

## 4. Trials are given once

Pass `trial_period_days` only when the customer never had a subscription
(`stripe.subscriptions.list({ customer, status: "all", limit: 1 })` is empty). Otherwise "cancel
and check out again" is an unlimited free trial.

## 5. Deleting an account or workspace

Block deletion while the subscription **would still charge**: `active`, `trialing`, `past_due`,
`unpaid`, and not `cancelAtPeriodEnd`. Deleting the row doesn't cancel anything at the provider; the
customer keeps paying for something that no longer exists. Check all of a user's workspaces in
**one** query, not one per workspace.

## 6. Webhooks

- Verify the signature with the raw body before parsing.
- Don't trust the event's payload as the final state: re-fetch the subscription from the provider
  and upsert it (events arrive out of order and can repeat).
- Return 200 for events you ignore, so the provider stops retrying.

## Checklist before you finish

- [ ] One status-mapping module; components never compare raw status strings.
- [ ] `periodNote` (or equivalent) unit-tested for every status x cancel flag.
- [ ] Checkout re-checks the provider on the server; Stripe open sessions expired.
- [ ] Payment problems show "Manage subscription", not "Upgrade".
- [ ] Trial only for a first subscription.
- [ ] Deletion blocked while it would still charge.
