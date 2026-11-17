// Claude Code PreToolUse hook (Bash, registered in `.claude/settings.json`): blocks a production `supabase db push`
// that bypasses `pnpm db:push`. Exit 2 blocks the call and shows stderr to Claude; anything unexpected exits 0, so
// the hook never breaks unrelated tool calls.
import { text } from "node:stream/consumers";
import { z } from "zod";
import { GUARD_MESSAGE, isUnguardedDbPush } from "./push-guard.mts";

const hookInput = z.object({ tool_input: z.object({ command: z.string() }) });

let input: unknown = null;
try {
  input = JSON.parse(await text(process.stdin));
} catch {
  // Not JSON: nothing to guard.
}

const parsed = hookInput.safeParse(input);
if (parsed.success && isUnguardedDbPush(parsed.data.tool_input.command)) {
  process.stderr.write(`${GUARD_MESSAGE}\n`);
  process.exit(2);
}
