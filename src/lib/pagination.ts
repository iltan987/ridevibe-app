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

// Name cursor for lists ordered by (name, id) — the member directory (Turkish collation lives in the DB).
export type NameCursor = { name: string; id: string };

export function encodeNameCursor({ name, id }: NameCursor) {
  return Buffer.from(JSON.stringify([name, id])).toString("base64url");
}

/** Parses an untrusted `?cursor=` value for name-ordered lists; null when absent or malformed. */
export function decodeNameCursor(value: unknown): NameCursor | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null;
  const [name, id] = parsed;
  if (typeof name !== "string" || typeof id !== "string") return null;
  // Count code points (the DB limit is in characters), not UTF-16 units: emoji take two.
  const length = Array.from(name).length;
  if (length < 1 || length > 120 || !UUID.test(id)) return null;
  return { name, id };
}

/** PostgREST `.or()` filter: rows that come after `cursor` in (created_at desc, id desc) order. */
export function afterCursorFilter({ createdAt, id }: Cursor) {
  return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`;
}

/** Fetch size + 1 rows; this splits them into the page and the next cursor (built from the last item on the page). */
export function splitPage<T>(rows: T[], size: number, cursorOf: (last: T) => string) {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  const nextCursor = rows.length > size && last !== undefined ? cursorOf(last) : null;
  return { items, nextCursor };
}

/** Fetch PAGE_SIZE + 1 rows; this splits them into the page and the next cursor. */
export function toPage<T extends { created_at: string; id: string }>(rows: T[], size = PAGE_SIZE) {
  return splitPage(rows, size, (last) => encodeCursor({ createdAt: last.created_at, id: last.id }));
}

/** Escapes `%`, `_` and `\` for a PostgREST `ilike` contains-search. */
export function ilikeContains(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
