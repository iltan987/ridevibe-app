// Keyset ("seek") pagination for lists ordered newest first by
// (created_at desc, id desc). Unlike offsets it stays fast and stable while
// rows are being added. Every list in the app paginates — never a fixed cap.
// Dependency-free so `node --test` can run its tests.

export const PAGE_SIZE = 25;

export type Cursor = { createdAt: string; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Postgres timestamptz as returned by PostgREST, e.g. 2026-11-08T18:31:35.619123+00:00
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function encodeCursor({ createdAt, id }: Cursor) {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}

/** Parses an untrusted `?cursor=` value; null when absent or malformed. */
export function decodeCursor(value: unknown): Cursor | null {
  if (typeof value !== "string" || value.length > 200) return null;
  const [createdAt, id, ...rest] = Buffer.from(value, "base64url").toString("utf8").split("|");
  if (rest.length || !createdAt || !id || !TIMESTAMP.test(createdAt) || !UUID.test(id)) return null;
  return { createdAt, id };
}

/** PostgREST `.or()` filter: rows that come after `cursor` in (created_at desc, id desc) order. */
export function afterCursorFilter({ createdAt, id }: Cursor) {
  return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`;
}

/** Fetch PAGE_SIZE + 1 rows; this splits them into the page and the next cursor. */
export function toPage<T extends { created_at: string; id: string }>(rows: T[], size = PAGE_SIZE) {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  const nextCursor = rows.length > size && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null;
  return { items, nextCursor };
}

/** Escapes `%`, `_` and `\` for a PostgREST `ilike` contains-search. */
export function ilikeContains(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
