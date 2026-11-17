// Turns a decrypted data dump (`data.sql` from `pnpm db:backup`) into restore SQL, one transaction:
//
//   gpg --decrypt <backup>/data.sql.gpg | node scripts/db/restore-sql.mts | psql …
//
// Restored: every `public` table and the accounts in `auth` (`users`, `identities`). Skipped: auth's short-lived
// tables (sessions, tokens, flows) and audit log, `storage` (unused) and the rest; their columns also differ between
// the hosted and the local Supabase versions. Each kept table is emptied with DELETE right before its COPY block; the
// dump's own `session_replication_role = replica` turns triggers and foreign-key checks off for the session.
// Runbook: docs/runbooks/database-backup.md.
import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const RESTORED_AUTH_TABLES: readonly string[] = ["users", "identities"];

export function isRestoredTable(schema: string, table: string): boolean {
  return schema === "public" || (schema === "auth" && RESTORED_AUTH_TABLES.includes(table));
}

const COPY_HEADER = /^COPY "([^"]+)"\."([^"]+)"/;
const SETVAL = /^SELECT pg_catalog\.setval\('"([^"]+)"\./;
const END_OF_DATA = "\\.";
/** pg_dump's last line (commented out by the CLI): a dump without it was cut off. */
const END_OF_DUMP = "-- \\unrestrict ";

/** Ends in COMMIT only for a complete dump; a cut-off one (e.g. a failed decrypt) ends in ROLLBACK. */
export function createRestoreFilter(
  isRestored: (schema: string, table: string) => boolean,
): Transform & { complete(): boolean } {
  const decoder = new StringDecoder("utf8");
  let rest = "";
  let inBlock = false;
  let keep = false;
  let complete = false;

  const lineOut = (line: string): string => {
    if (inBlock) {
      if (line === END_OF_DATA) inBlock = false;
      return keep ? `${line}\n` : "";
    }
    if (line.startsWith(END_OF_DUMP)) complete = true;
    const header = COPY_HEADER.exec(line);
    if (header) {
      const [, schema, table] = header;
      inBlock = true;
      keep = isRestored(schema, table);
      return keep ? `DELETE FROM "${schema}"."${table}";\n${line}\n` : "";
    }
    const setval = SETVAL.exec(line);
    // Sequences only exist for public tables and for auth tables we skip (`refresh_tokens_id_seq`).
    if (setval && setval[1] !== "public") return "";
    return `${line}\n`;
  };

  const linesOut = (text: string): string => {
    const lines = (rest + text).split("\n");
    rest = lines.pop() ?? "";
    return lines.map(lineOut).join("");
  };

  const transform = new Transform({
    construct(callback) {
      this.push("BEGIN;\n");
      callback();
    },
    transform(chunk: Buffer, _encoding, callback) {
      callback(null, linesOut(decoder.write(chunk)));
    },
    flush(callback) {
      let out = linesOut(decoder.end());
      if (rest !== "") out += lineOut(rest);
      callback(null, `${out}${complete ? "COMMIT" : "ROLLBACK"};\n`);
    },
  });
  return Object.assign(transform, { complete: () => complete });
}

if (import.meta.main) {
  const restore = createRestoreFilter(isRestoredTable);
  await pipeline(process.stdin, restore, process.stdout);
  if (!restore.complete()) {
    process.stderr.write("The dump ended early (no pg_dump end line): rolled back, nothing restored.\n");
    process.exitCode = 1;
  }
}
