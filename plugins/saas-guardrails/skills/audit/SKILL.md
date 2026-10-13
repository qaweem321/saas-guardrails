---
name: audit
description: Audit a web app with logins (and optionally billing) for production bugs - billing wording, duplicate subscriptions, race conditions, SSRF, auth redirects, file deletion, rate limits, polish. Reports findings ranked by severity, each verified against the code.
argument-hint: "[path or area to focus on, e.g. src/app/billing]"
disable-model-invocation: true
---

# SaaS production audit

Audit this codebase (focus: $ARGUMENTS, or the whole app if empty) for the bugs that real SaaS
products ship. Read the related skills in this plugin for the details of each area:
`billing-states`, `race-safe-writes`, `safe-outbound-requests`, `auth-flow`, `file-uploads`.

## How to work

1. **Map the app first.** Find the framework, the database layer, auth, billing provider, file
   storage, background jobs and every place the server makes outbound requests. Note which areas
   exist; skip checks for areas that don't.
2. **Check each area below** by reading the actual code paths, not by grepping for keywords alone.
3. **Verify every finding** before reporting it: trace the input to the effect, and describe a
   concrete scenario (who does what, in what order, and what goes wrong). Drop anything you can't
   make concrete. If you can run a small script or test to confirm it safely, do.
4. **Don't change code** unless the user asks. Report first.

## What to check

### Critical: security and money
- **SSRF**: user-typed URLs fetched by the server (webhooks, "send test", previews, imports). Is the
  host checked after `new URL()`, with IPv6-mapped IPv4 handled (`[::ffff:127.0.0.1]` becomes
  `[::ffff:7f00:1]`)? Is the resolved address checked at connect time? Are redirects followed?
- **Cross-tenant access**: every query on tenant data filtered by the tenant ID taken from the
  session, never from the request body.
- **File IDs from forms**: can a user attach, replace or delete a file they didn't upload
  (including files staff uploaded about them)? Is a replaced file deleted while still referenced?
- **Duplicate subscriptions**: is "already subscribed" checked on the server, against the payment
  provider (not only the local database), with two-tab checkouts handled?
- **Idempotency keys**: fixed keys that return a cancelled or failed result on retry.
- **Deleting accounts/workspaces** while a subscription still charges.

### High: correctness under concurrency
- "Check then write" across rows: last owner/admin, seat limits, coupons, stock, first user becomes
  admin. Two parallel requests: do both pass?
- Stored counters updated without a lock on the parent row.
- Merges/moves that can form cycles when run in both directions at once.
- Jobs that mark work done before doing it and never retry on failure.

### Medium: wording and state
- Billing text for every status (`trialing`, `active`, cancelled at period end, `past_due`,
  `unpaid`, `incomplete`, `paused`, `canceled`, `incomplete_expired`): does any message contradict
  the real state? "Renews on" next to "payment failed" or for an ended subscription; "Free trial
  ends" after a cancel. Are these messages unit-tested?
- Payment problems offering "Upgrade" instead of "Manage subscription".
- Repeatable free trials.
- Ambiguous dates (`10/11/2026`) or dates formatted in different time zones on server and client.

### Medium: auth and abuse
- Login limits per IP and per account; email-sending endpoints limited per user, not only per
  organization.
- `?next=` validated as a same-site path; kept through signup and session expiry.
- Logged-in visitors on login/signup/landing pages; logo inside the app; back button after logout
  (`location.replace`, `pageshow` reload).
- Public search or list endpoints without a rate limit; expensive queries on public pages; writes
  on every public page view.

### Low: polish
- Destructive actions without confirmation; submit buttons that allow double submits.
- Missing loading, empty and error states; no `global-error` (or equivalent) for root failures.
- Missing indexes on foreign keys used in lookups; queries inside loops.
- Environment variables not checked at startup; missing security headers.

## Report format

Group by severity (Critical, High, Medium, Low). For each finding:

- **Where**: `path/to/file.ts:line`
- **Problem**: one sentence in plain language.
- **Scenario**: the concrete steps that trigger it.
- **Fix**: the smallest change that removes the cause (point to the matching skill).

End with what you checked and found fine, and anything you couldn't verify. Keep it short: a
reader should be able to act on the top three findings in ten minutes.
