# saas-guardrails

**A Claude Code plugin that stops your AI from shipping the bugs real SaaS apps ship.**

AI coding tools write billing pages, member management and webhooks that look right and pass
tests. Then, under real traffic, a cancelled trial still says *"Free trial ends on Oct 14"*, two
owners remove each other and the workspace has none, and a "Send test" webhook button reads your
cloud credentials through `https://[::ffff:169.254.169.254]/`.

Every rule in this plugin comes from a bug found in a production codebase. Each comes with the fix
and a test that proves it.

```bash
claude plugin marketplace add qaweem321/saas-guardrails
claude plugin install saas-guardrails@saas-guardrails
```

Then, in any project:

```
/saas-guardrails:audit
```

## What you get

| Skill | Runs | Catches |
| --- | --- | --- |
| `audit` | when you type `/saas-guardrails:audit [area]` | A ranked, verified bug report across all areas below |
| `billing-states` | automatically, when Claude touches billing | Wording that contradicts the real subscription state, duplicate subscriptions, repeatable trials, deleting accounts that still get charged |
| `race-safe-writes` | automatically, for "check then write" code | Last-owner races, drifting counters, merge loops, reused idempotency keys, double-sent emails |
| `safe-outbound-requests` | automatically, for user-typed URLs | SSRF through IPv6-mapped addresses, DNS rebinding, redirects |
| `auth-flow` | automatically, for login and sessions | Open redirects in `?next=`, stale pages after logout, weak login limits, invite spam |
| `file-uploads` | automatically, for file IDs from forms | Users attaching or deleting files that aren't theirs, evidence deleted while still referenced |

The skills are plain Markdown (`plugins/saas-guardrails/skills/*/SKILL.md`): read them, fork them,
or copy the rules into your own `CLAUDE.md`.

## Try it on a buggy app

`examples/buggy-app` is a small made-up SaaS with **7 planted bugs** (SSRF, a deposit that isn't
really held, files a customer can delete, duplicate subscriptions, an owner race, wrong billing
wording, an open redirect).

```bash
cd examples/buggy-app
claude --plugin-dir ../../plugins/saas-guardrails
> /saas-guardrails:audit
```

Compare the result with [`EXPECTED-FINDINGS.md`](examples/buggy-app/EXPECTED-FINDINGS.md).

## Five bugs it knows about

**1. `new URL()` rewrites the address your regex checks.**

```js
new URL("https://[::ffff:169.254.169.254]/").hostname  // "[::ffff:a9fe:a9fe]"
```

A blocklist regex for `::ffff:169.254.` never matches. The skill uses Node's `net.BlockList`, which
understands IPv4 inside IPv6, and checks the address again at connect time.

**2. "Keep at least one owner" fails under load.** Two owners remove each other: both requests
count 2 owners, both delete. The fix is one statement that locks the owner rows first. The second
request waits, then sees the first one's change and is refused.

**3. A cancelled trial that says nothing changed.** `if (trialing) return "Free trial ends on..."`
runs before the cancel check, so the customer cancels and the page still reads as if they hadn't.
And `Renews on ...` shows right next to `Your last payment failed`.

**4. A fixed idempotency key returns yesterday's cancelled payment.**
`` idempotencyKey: `deposit-${id}` `` makes a retried pickup get back the hold that was just
cancelled. Staff think the deposit is on the card, but it isn't.

**5. A file ID from a form deletes someone else's evidence.** The customer submits the ID of an
inspection photo staff took of their car as their "ID document", then replaces it. The old file,
the damage evidence, gets deleted.

## How this was tested

- `npm run check` validates the marketplace and plugin format and runs 23 tests.
- The tests **load the code examples straight out of the SKILL.md files**, so the docs can't
  drift from what's tested: the SSRF check against 15 private-address forms (IPv6-mapped, NAT64, short and decimal IPv4), `safeNextPath` against
  open-redirect tricks, billing wording for every status, and the owner-lock SQL on a real Postgres
  (PGlite).
- The owner-lock SQL was also run with **two live connections racing** on a hosted Postgres (Neon):
  the second removal waits for the first and is refused, 5 out of 5 rounds.
- The sample app's bugs are tested too, so the demo stays honest.

```bash
npm install
npm run check
```

## Contributing

Found a bug pattern that AI tools keep shipping? Open an issue with the smallest code that shows it
and what goes wrong. A rule gets added when it comes with a fix and a test.

## License

MIT
