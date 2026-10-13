// Runs the skill's SQL on a real Postgres (PGlite, in-process). One connection can't race, so this
// checks the rules themselves; the locking was also verified with two live connections on Postgres
// (see README, "How this was tested").
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { codeBlock } from "./snippets.ts";

const removeSql = codeBlock("race-safe-writes", "with owners as");
const db = new PGlite();
await db.exec(
  "create table memberships (id text primary key, organization_id text, user_id text, role text)",
);

beforeEach(async () => {
  await db.exec(`delete from memberships;
    insert into memberships values ('mA','o','A','owner'), ('mB','o','B','owner'),
      ('mC','o','C','member'), ('mX','other','X','owner');`);
});

// Removes membership `target` on behalf of user `actor`; true when it went through.
async function remove(target: string, actor: string) {
  const result = await db.query(removeSql, ["o", target, actor]);
  return result.rows.length === 1;
}

async function owners() {
  const result = await db.query<{ id: string }>(
    "select id from memberships where organization_id = 'o' and role = 'owner' order by id",
  );
  return result.rows.map((row) => row.id);
}

test("an owner can remove another owner while one remains", async () => {
  assert.equal(await remove("mB", "A"), true);
  assert.deepEqual(await owners(), ["mA"]);
});

test("the last owner can't be removed, not even by themselves", async () => {
  await remove("mB", "A");
  assert.equal(await remove("mA", "A"), false);
  assert.deepEqual(await owners(), ["mA"]);
});

test("someone who is no longer an owner can't remove an owner", async () => {
  await db.exec("update memberships set role = 'admin' where id = 'mB'");
  assert.equal(await remove("mA", "B"), false);
});

test("only an owner can remove anyone, members included", async () => {
  assert.equal(await remove("mB", "C"), false); // a plain member
  assert.equal(await remove("mC", "X"), false); // an owner of another organization
  assert.equal(await remove("mC", "nobody"), false);
  assert.equal(await remove("mC", "B"), true);
});

test("members can be removed; other organizations are untouched", async () => {
  assert.equal(await remove("mC", "A"), true);
  assert.equal(await remove("mX", "A"), false);
});

test("the documented 'wrong' version really allows zero owners", async () => {
  // Both requests read the count first (2 owners), then both delete.
  const [{ n }] = (await db.query<{ n: number }>(
    "select count(*)::int as n from memberships where organization_id = 'o' and role = 'owner'",
  )).rows;
  assert.equal(n, 2);
  await db.exec("delete from memberships where id = 'mB'");
  await db.exec("delete from memberships where id = 'mA'");
  assert.deepEqual(await owners(), []);
});
