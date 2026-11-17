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

export function createRestoreFilter(isRestored: (schema: string, table: string) => boolean): Transform {
  const decoder = new StringDecoder("utf8");
  let rest = "";
  let inBlock = false;
  let keep = false;

  const lineOut = (line: string): string => {
    if (inBlock) {
      if (line === END_OF_DATA) inBlock = false;
      return keep ? `${line}\n` : "";
    }
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

  return new Transform({
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
      callback(null, `${out}COMMIT;\n`);
    },
  });
}

if (import.meta.main) {
  await pipeline(process.stdin, createRestoreFilter(isRestoredTable), process.stdout);
}
