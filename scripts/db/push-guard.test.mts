// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { PUSH_MESSAGE, QUERY_MESSAGE, REMOTE_WRITE_MESSAGE, RESET_MESSAGE, remoteWriteBlock } from "./push-guard.mts";

const pushes = [
  "pnpm exec supabase db push --remote=postgres://x",
  "supabase db push --remote",
  "npx supabase db push --db-url postgres://x",
  "supabase --workdir . db push --linked",
  "cd /repo && pnpm exec supabase db push --remote=$URL --yes",
  "supabase db push --remote=x | tee log",
  "supabase  db   push --remote",
  "pnpm exec supabase db push \\\n  --remote=$URL --yes",
  "pnpm exec supabase db \\\n  push --remote=$URL",
  // A dry-run in another command doesn't cover the push (single `&` runs both).
  "supabase db push --remote=x --dry-run & supabase db push --remote=x",
  "supabase db push --remote=x --dry-run &supabase db push --remote=x",
  "supabase db push --remote=x 2>&1",
  "npx supabase@3 db push --remote",
  "supabase --debug db push --remote",
  // Only an exact `--dry-run` flag counts, not a value or a shell comment.
  "supabase db push --remote=x --dry-run=false --yes",
  "supabase db push --remote=x --yes # --dry-run",
];

const resets = [
  "supabase db reset --remote",
  "pnpm exec supabase db reset --remote=postgres://x --yes",
  "supabase db reset --linked",
  "npx supabase db reset --db-url postgres://x",
  "supabase db reset --remote --dry-run",
  "echo ok && supabase db reset --remote=$URL",
  "supabase --workdir . db reset --remote",
];

const queries = [
  'supabase db query --remote "delete from public.profiles"',
  "pnpm exec supabase db query --remote=$URL -f fix.sql --yes",
  'supabase db query --linked "select 1"',
  'supabase db query --remote "select 1" --read-only=false',
  'supabase db query --remote "select 1" # --read-only',
  'supabase db query --remote "select 1 # x" --yes',
];

const remoteWrites = [
  "supabase migration up --remote",
  "pnpm exec supabase migration up --remote=$URL",
  "supabase migration up --linked",
  "supabase migration up --db-url postgres://x",
  "supabase migration down --remote --last 1",
  "supabase migration repair --remote --status reverted 20261118000000",
  "supabase migration squash --remote",
  "supabase seed buckets --remote",
  "supabase seed --remote=igqqicbfejhnsggfuydh",
  // Migration mode records the pulled migration in production's history.
  "supabase db pull --remote",
  "pnpm exec supabase db pull remote_changes --remote=$URL --yes",
];

const allowed = [
  "pnpm db:push",
  "pnpm db:push --yes",
  "pnpm db:reset",
  "supabase db push",
  "supabase db reset",
  "pnpm exec supabase migration up",
  "supabase migration repair --status reverted 1",
  "supabase seed buckets",
  "pnpm exec supabase db push --remote=x --dry-run",
  "pnpm exec supabase db dump --remote=x",
  "pnpm exec supabase migration list --remote=x",
  "pnpm exec supabase migration fetch --remote",
  "pnpm exec supabase db diff --remote",
  "git push",
  "supabase test db --remote=x",
  "echo done && supabase db push",
  "supabase db push; echo --remote",
  "supabase db reset & echo --remote",
  "supabase db reset 2>&1 | tail -5",
  "supabase migration up &>/dev/null; echo --remote",
  'supabase db query --remote --read-only "select count(*) from public.profiles"',
  "pnpm exec supabase db query --read-only --remote=$URL -f check.sql",
  'supabase db query "delete from public.profiles"',
  "supabase db pull --remote --declarative",
  "supabase db pull",
  // A subcommand name elsewhere in the line (a file name, a schema list) is not the subcommand.
  "pnpm exec supabase db dump --remote=x --data-only -f supabase/seed.sql",
  "pnpm exec supabase db dump --remote=x --schema public,seed",
  "pnpm exec supabase db dump --remote=x -f db-reset-notes.sql",
];

for (const command of pushes) {
  test(`blocks push: ${command}`, () => {
    assert.equal(remoteWriteBlock(command), PUSH_MESSAGE);
  });
}

for (const command of resets) {
  test(`blocks reset: ${command}`, () => {
    assert.equal(remoteWriteBlock(command), RESET_MESSAGE);
  });
}

for (const command of queries) {
  test(`blocks query: ${command}`, () => {
    assert.equal(remoteWriteBlock(command), QUERY_MESSAGE);
  });
}

for (const command of remoteWrites) {
  test(`blocks remote write: ${command}`, () => {
    assert.equal(remoteWriteBlock(command), REMOTE_WRITE_MESSAGE);
  });
}

for (const command of allowed) {
  test(`allows: ${command}`, () => {
    assert.equal(remoteWriteBlock(command), null);
  });
}
