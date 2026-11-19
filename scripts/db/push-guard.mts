// Spots Supabase CLI commands that write to a remote (production) database without going through `pnpm db:push`
// (which backs up first). Used by the Claude Code PreToolUse hook (`guard-hook.mts`). A `db push --dry-run` writes
// nothing, so it stays allowed; read-only remote commands (`db dump`, `migration list`, `db diff`, …) pass too.

export const PUSH_MESSAGE =
  "Production pushes go through `pnpm db:push` (backs up first). See docs/runbooks/database-backup.md.";
export const RESET_MESSAGE =
  "Never reset the production database (it wipes every row). The local stack: `pnpm db:reset`.";
export const REMOTE_WRITE_MESSAGE =
  "Remote migration/seed writes go through `pnpm db:push` (backs up first); anything else, iltan runs it in their own " +
  "terminal. See docs/runbooks/database-backup.md.";

const LINE_CONTINUATION = /\\\r?\n/g;
// `&&`, `||`, `;`, `|`, newlines and a lone `&` (background): not the `&` of a redirect (`2>&1`, `&>`, `>&`).
const SEGMENT_SEPARATOR = /&&|\|\||(?<![<>&])&(?![>&])|[;|\n]/;
const DB_PUSH = /\bsupabase\b.*\bdb\s+push\b/;
const DB_RESET = /\bsupabase\b.*\bdb\s+reset\b/;
const REMOTE_WRITE = /\bsupabase\b.*\b(?:migration\s+(?:up|down|repair|squash)|seed)\b/;
const REMOTE_TARGET = /--(?:remote|db-url|linked)\b/;
const DRY_RUN = /--dry-run\b/;

function segmentBlock(segment: string): string | null {
  if (!REMOTE_TARGET.test(segment)) return null;
  if (DB_RESET.test(segment)) return RESET_MESSAGE;
  if (DB_PUSH.test(segment)) return DRY_RUN.test(segment) ? null : PUSH_MESSAGE;
  if (REMOTE_WRITE.test(segment)) return REMOTE_WRITE_MESSAGE;
  return null;
}

/** The message for the first remote write in `command` that must not run, or null when it may run. */
export function remoteWriteBlock(command: string): string | null {
  for (const segment of command.replace(LINE_CONTINUATION, " ").split(SEGMENT_SEPARATOR)) {
    const message = segmentBlock(segment);
    if (message !== null) return message;
  }
  return null;
}
