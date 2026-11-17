// Run with: pnpm test
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { test } from "node:test";
import { createRestoreFilter, isRestoredTable } from "./restore-sql.mts";

const dump = [
  "SET session_replication_role = replica;",
  'COPY "auth"."users" ("id", "email") FROM stdin;',
  "u1\ta@x.invalid",
  "\\.",
  'COPY "auth"."one_time_tokens" ("id", "link_token_hash") FROM stdin;',
  "t1\th1",
  "\\.",
  'COPY "storage"."buckets_analytics" ("id") FROM stdin;',
  "b1",
  "\\.",
  'COPY "public"."profiles" ("id", "full_name") FROM stdin;',
  'COPY "storage"."x" looks like a header but is data',
  "\\.",
  'SELECT pg_catalog.setval(\'"auth"."refresh_tokens_id_seq"\', 118, true);',
  'SELECT pg_catalog.setval(\'"storage"."some_seq"\', 3, true);',
  'SELECT pg_catalog.setval(\'"public"."some_seq"\', 7, true);',
  "RESET ALL;",
  "",
].join("\n");

async function filter(chunks: string[]) {
  return text(Readable.from(chunks).pipe(createRestoreFilter(isRestoredTable)));
}

const expected = [
  "BEGIN;",
  "SET session_replication_role = replica;",
  'DELETE FROM "auth"."users";',
  'COPY "auth"."users" ("id", "email") FROM stdin;',
  "u1\ta@x.invalid",
  "\\.",
  'DELETE FROM "public"."profiles";',
  'COPY "public"."profiles" ("id", "full_name") FROM stdin;',
  'COPY "storage"."x" looks like a header but is data',
  "\\.",
  'SELECT pg_catalog.setval(\'"public"."some_seq"\', 7, true);',
  "RESET ALL;",
  "COMMIT;",
  "",
].join("\n");

test("restore filter: keeps public data and auth accounts, each emptied first; drops the rest; one transaction", async () => {
  assert.equal(await filter([dump]), expected);
});

test("restore filter: chunk boundaries anywhere give the same output", async () => {
  const chunks = dump.match(/[\s\S]{1,7}/g) ?? [];
  assert.equal(await filter(chunks), expected);
});

test("isRestoredTable: every public table, auth accounts only", () => {
  assert.equal(isRestoredTable("public", "profiles"), true);
  assert.equal(isRestoredTable("auth", "users"), true);
  assert.equal(isRestoredTable("auth", "identities"), true);
  assert.equal(isRestoredTable("auth", "sessions"), false);
  assert.equal(isRestoredTable("auth", "one_time_tokens"), false);
  assert.equal(isRestoredTable("storage", "objects"), false);
});
