// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isUnguardedDbPush } from "./push-guard.mts";

const blocked = [
  "pnpm exec supabase db push --remote=postgres://x",
  "supabase db push --remote",
  "npx supabase db push --db-url postgres://x",
  "supabase --workdir . db push --linked",
  "cd /repo && pnpm exec supabase db push --remote=$URL --yes",
  "supabase db push --remote=x | tee log",
  "supabase  db   push --remote",
  "pnpm exec supabase db push \\\n  --remote=$URL --yes",
  "pnpm exec supabase db \\\n  push --remote=$URL",
];

const allowed = [
  "pnpm db:push",
  "pnpm db:push --yes",
  "supabase db push",
  "pnpm exec supabase db push --remote=x --dry-run",
  "pnpm exec supabase db dump --remote=x",
  "git push",
  "supabase test db --remote=x",
  "echo done && supabase db push",
  "supabase db push; echo --remote",
];

for (const command of blocked) {
  test(`blocks: ${command}`, () => {
    assert.equal(isUnguardedDbPush(command), true);
  });
}

for (const command of allowed) {
  test(`allows: ${command}`, () => {
    assert.equal(isUnguardedDbPush(command), false);
  });
}
