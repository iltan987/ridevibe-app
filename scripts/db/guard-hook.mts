// Claude Code PreToolUse hook (Bash, registered in `.claude/settings.json`): blocks Supabase CLI writes to a remote
// database that bypass `pnpm db:push` (`db push`, `db reset`, `migration up/down/repair/squash`, `seed`). Exit 2
// blocks the call and shows stderr to Claude; anything unexpected exits 0, so the hook never breaks unrelated tool
// calls.
import { text } from "node:stream/consumers";
import { z } from "zod";
import { remoteWriteBlock } from "./push-guard.mts";

const hookInput = z.object({ tool_input: z.object({ command: z.string() }) });

let input: unknown = null;
try {
  input = JSON.parse(await text(process.stdin));
} catch {
  // Not JSON: nothing to guard.
}

const parsed = hookInput.safeParse(input);
const message = parsed.success ? remoteWriteBlock(parsed.data.tool_input.command) : null;
if (message !== null) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
