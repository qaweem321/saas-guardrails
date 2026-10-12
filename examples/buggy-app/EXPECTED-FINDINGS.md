# Answer key: the 7 planted bugs

Spoilers for `/saas-guardrails:audit`. A good audit finds all seven, with a concrete scenario for
each.

## Critical

1. **SSRF in "Send test"** (`app/webhooks/actions.ts`). The regex misses
   `https://[::ffff:127.0.0.1]/` and `https://[::ffff:169.254.169.254]/` (`new URL()` turns them
   into `[::ffff:7f00:1]` and `[::ffff:a9fe:a9fe]`), and any domain that resolves to a private
   address. `fetch` follows redirects, and the response body is shown to the user, so this reads
   the cloud metadata service.
   Skill: `safe-outbound-requests`.
2. **Customers can delete files that aren't theirs to manage** (`app/profile/actions.ts`). The check
   is only `ownerId`, so a photo staff uploaded about the customer (an inspection photo, a signature)
   passes. Saving it as the ID document, then replacing it, deletes it, and the old file is deleted
   without checking whether anything else uses it. Skill: `file-uploads`.
3. **A retried pickup records a deposit that isn't held** (`lib/deposits.ts`). The idempotency key is
   fixed, so after a failed pickup cancels the hold, the retry gets the same cancelled
   PaymentIntent back. The status isn't checked. Skill: `race-safe-writes`.

## High

4. **Duplicate subscriptions and endless trials** (`app/billing/actions.ts`). "Already on Pro" only
   checks the local database (the webhook may not have arrived; two tabs can both pay), a
   `past_due` subscription can start a second checkout, and `trial_period_days: 14` is given on every
   checkout. Skill: `billing-states`.
5. **Two owners can remove each other at the same moment** (`app/members/actions.ts`). Both requests
   count 2 owners, then both delete: the organization has no owner. Skill: `race-safe-writes`.

## Medium

6. **Billing wording contradicts the real state** (`lib/billing.ts`). A cancelled trial says
   "Free trial ends on ..." (the trial check comes first), `past_due` says "Renews on ...", and
   `toLocaleDateString()` gives ambiguous dates that change with the server's locale and time zone.
   Skill: `billing-states`.
7. **Open redirect and stale back button after login** (`app/login/login-form.tsx`). `next` is used
   unchecked (`/login?next=https://evil.com`), and `router.push` instead of a full page load leaves
   logged-out pages in the history. Skill: `auth-flow`.
