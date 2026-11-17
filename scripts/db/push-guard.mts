// Spots a production `supabase db push` that skips `pnpm db:push` (which backs up first). Used by the Claude Code
// PreToolUse hook (`guard-hook.mts`). A dry-run writes nothing, so it stays allowed.

export const GUARD_MESSAGE =
  "Production pushes go through `pnpm db:push` (backs up first). See docs/runbooks/database-backup.md.";

const LINE_CONTINUATION = /\\\r?\n/g;
const SEGMENT_SEPARATOR = /&&|\|\||[;|\n]/;
const DB_PUSH = /\bsupabase\b.*\bdb\s+push\b/;
const REMOTE_TARGET = /--(?:remote|db-url|linked)\b/;
const DRY_RUN = /--dry-run\b/;

export function isUnguardedDbPush(command: string): boolean {
  return command
    .replace(LINE_CONTINUATION, " ")
    .split(SEGMENT_SEPARATOR)
    .some((segment) => DB_PUSH.test(segment) && REMOTE_TARGET.test(segment) && !DRY_RUN.test(segment));
}
