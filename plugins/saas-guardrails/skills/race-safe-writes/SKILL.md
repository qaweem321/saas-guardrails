---
name: race-safe-writes
description: Use when writing database code where two requests can run at the same moment - "check then write" logic, counters, last-owner or last-admin rules, merges, first-user-becomes-admin setup, coupons and stock limits, payment retries and idempotency keys (Postgres, Drizzle, Prisma, Supabase). Prevents bugs that only appear under real traffic.
---

# Race-safe writes

Two requests that each pass a check, then each write, break invariants your tests never see.
Postgres runs each statement in `READ COMMITTED` by default: a statement sees data committed
**before it started**, so `count(*)` in two parallel requests can both see the old number.

## Pick the right tool

| Problem | Fix |
| --- | --- |
| "Only if X doesn't exist" for a row with a natural key | A `unique` constraint, then catch the unique violation (23505) and show a message. Don't check first. |
| "Never overlap" (bookings, schedules) | An exclusion constraint (`btree_gist`, `tstzrange && `). |
| A rule over **several rows** (keep at least one owner, max N seats) | Lock those rows first (`select ... for update`) in the same statement or transaction, then check and write. |
| A rule over rows that may **not exist yet** (first user becomes owner) | `pg_advisory_xact_lock(hashtext('app:setup'))` at the start of the transaction. |
| Stored counters (`vote_count`) | Lock the parent row, change the child rows, then recount, all in one transaction. |
| External side effects (Stripe charges, emails) | Idempotency keys that change when the *intent* changes, and "claim, then do, then unclaim on failure". |

## Keep at least one owner

Wrong (both requests count 2 owners, both delete):

```ts
const owners = await db.$count(memberships, and(eq(org, id), eq(role, "owner")));
if (owners > 1) await db.delete(memberships).where(eq(memberships.id, targetId));
```

Right: one statement that locks the owner rows first. The second request waits for the first to
commit, then re-reads the locked rows and sees the change:

```sql
with owners as (
  select id, user_id from memberships
  where organization_id = $1 and role = 'owner'
  for update
)
delete from memberships m
where m.id = $2 and m.organization_id = $1
  and exists (select 1 from owners where user_id = $3)      -- the actor is (still) an owner
  and (m.role <> 'owner'
    or exists (select 1 from owners where id <> m.id))      -- another owner remains
returning m.id;  -- no row back = refused
```

Use the same pattern for demoting and for "leave organization". Re-check the actor's own
permission inside the locked statement: they may have been demoted a moment ago.

## Stored counts

```ts
await db.transaction(async (tx) => {
  await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).for("update");
  await tx.insert(votes).values({ postId, voterId }).onConflictDoNothing();
  await tx.update(posts).set({ voteCount: sql`(select count(*) from votes where post_id = ${postId})` })
    .where(eq(posts.id, postId));
});
```

Without the lock, two votes each recount without seeing the other's uncommitted row and the count
ends one too low. When locking several rows, lock them **in a fixed order** (`order by id`) so two
transactions can't deadlock.

## Merges and moves (A into B while B into A)

Lock both rows, then guard every statement with "neither is already merged". If the guard fails,
nothing happens and you tell the user to reload. Otherwise A points to B and B to A: an endless
redirect.

## Idempotency keys

A fixed key like `deposit-${bookingId}` returns the **same** result forever, including a hold you
already cancelled. Number the key by attempt (`deposit-${bookingId}-${earlierHolds}`) so two
simultaneous clicks share one charge, while a deliberate retry gets a fresh one. Then check the
returned object's status (`requires_capture`, `succeeded`) instead of assuming it worked.

## "Claim, then send"

For reminders or daily emails: mark rows as sent in one `update ... where sent_at is null
returning id` (so two cron runs can't both send), send, and if sending fails **unmark** them so the
next run retries.

## HTTP-only drivers

Serverless HTTP drivers (Neon HTTP, some edge drivers) have no interactive transactions. Use their
batch/transaction API (`db.batch([...])`): statements run in order in one transaction, and each
statement still gets a fresh snapshot, so a `for update` lock in the first statement protects the
rest.

## Checklist

- [ ] No "read, decide in JS, write" for rules that span rows; locking or constraints instead.
- [ ] Unique and exclusion constraints carry the invariants the database can express.
- [ ] Counters recounted under a lock, in the same transaction as the change.
- [ ] Locks taken in a fixed order.
- [ ] Idempotency keys change when the intent changes; results are checked.
- [ ] Claimed work is unclaimed when it fails.
