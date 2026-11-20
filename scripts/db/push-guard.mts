// Spots Supabase CLI commands that write to a remote (production) database without going through `pnpm db:push`
// (which backs up first). Used by the Claude Code PreToolUse hook (`guard-hook.mts`). Each write has a harmless form
// that stays allowed (`db push --dry-run`, `db query --read-only`, `db pull --declarative`); read-only remote commands
// (`db dump`, `migration list`, `db diff`, …) pass too.

export const PUSH_MESSAGE =
  "Production pushes go through `pnpm db:push` (backs up first). See docs/runbooks/database-backup.md.";
export const RESET_MESSAGE =
  "Never reset the production database (it wipes every row). The local stack: `pnpm db:reset`.";
export const QUERY_MESSAGE =
  "SQL against production is read-only: add `--read-only`. Data changes are hand-written migrations, pushed with " +
  "`pnpm db:push`.";
export const REMOTE_WRITE_MESSAGE =
  "Remote migration/seed writes go through `pnpm db:push` (backs up first); anything else, iltan runs it in their own " +
  "terminal. See docs/runbooks/database-backup.md.";

const LINE_CONTINUATION = /\\\r?\n/g;
// `&&`, `||`, `;`, `|`, newlines and a lone `&` (background): not the `&` of a redirect (`2>&1`, `&>`, `>&`).
const SEGMENT_SEPARATOR = /&&|\|\||(?<![<>&])&(?![>&])|[;|\n]/;
const REMOTE_TARGET = /--(?:remote|db-url|linked)\b/;
// A shell comment: ignored when looking for an allowing flag, so `# --dry-run` doesn't count.
const COMMENT = /(?:^|\s)#.*$/;

/** `supabase` (optionally `@version`), any global flags (with a value), then the subcommand. */
function subcommand(pattern: string): RegExp {
  return new RegExp(String.raw`\bsupabase(?:@\S+)?\s+(?:--?[\w-]+(?:=\S*|\s+[^-\s]\S*)?\s+)*(?:${pattern})(?![\w-])`);
}

/** The exact flag (not `--flag=false`). */
function flag(name: string): RegExp {
  return new RegExp(String.raw`(?:^|\s)--${name}(?=\s|$)`);
}

const RULES: { command: RegExp; allowedBy?: RegExp; message: string }[] = [
  { command: subcommand(String.raw`db\s+reset`), message: RESET_MESSAGE },
  { command: subcommand(String.raw`db\s+push`), allowedBy: flag("dry-run"), message: PUSH_MESSAGE },
  { command: subcommand(String.raw`db\s+query`), allowedBy: flag("read-only"), message: QUERY_MESSAGE },
  { command: subcommand(String.raw`db\s+pull`), allowedBy: flag("declarative"), message: REMOTE_WRITE_MESSAGE },
  {
    command: subcommand(String.raw`migration\s+(?:up|down|repair|squash)|seed`),
    message: REMOTE_WRITE_MESSAGE,
  },
];

function segmentBlock(segment: string): string | null {
  if (!REMOTE_TARGET.test(segment)) return null;
  const rule = RULES.find(({ command }) => command.test(segment));
  if (!rule) return null;
  return rule.allowedBy?.test(segment.replace(COMMENT, "")) ? null : rule.message;
}

/** The message for the first remote write in `command` that must not run, or null when it may run. */
export function remoteWriteBlock(command: string): string | null {
  for (const segment of command.replace(LINE_CONTINUATION, " ").split(SEGMENT_SEPARATOR)) {
    const message = segmentBlock(segment);
    if (message !== null) return message;
  }
  return null;
}
