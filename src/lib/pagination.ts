// Keyset ("seek") pagination for lists ordered newest first by
// (created_at desc, id desc). Unlike offsets it stays fast and stable while
// rows are being added. Every list in the app paginates — never a fixed cap.
// Dependency-free so `node --test` can run its tests.

export const PAGE_SIZE = 25;
// Lists that filter in the browser read everything up to LIST_CEILING rows, CHUNK_SIZE at a time
// (CHUNK_SIZE = Supabase `[api] max_rows`).
export const LIST_CEILING = 2000;
export const CHUNK_SIZE = 1000;

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

/** Parses an untrusted `?page=` value (1-based); anything but a canonical positive integer is page 1. */
export function parsePage(value: unknown): number {
  return typeof value === "string" && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : 1;
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  return Math.min(Math.max(1, page), pageCount(total, size));
}

/** Numbers for a pager: first, last, current ±1. A gap only replaces 2+ hidden pages. */
export function pageItems(current: number, count: number): (number | "gap")[] {
  const shown = new Set([1, count, current - 1, current, current + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...shown].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  let previous = 0;
  for (const n of sorted) {
    if (n - previous === 2) items.push(previous + 1);
    else if (n - previous > 2) items.push("gap");
    items.push(n);
    previous = n;
  }
  return items;
}

/**
 * Reads a list in chunks until a short chunk or more than `ceiling` rows. Returns at most `ceiling` items;
 * never requests past index `ceiling` (so at most ceiling + 1 rows are fetched).
 */
export async function readAll<T>(
  fetchRange: (from: number, to: number) => Promise<T[]>,
  ceiling = LIST_CEILING,
  chunk = CHUNK_SIZE,
): Promise<{ items: T[]; overCeiling: boolean }> {
  const items: T[] = [];
  while (items.length <= ceiling) {
    const from = items.length;
    const to = Math.min(from + chunk - 1, ceiling);
    const rows = await fetchRange(from, to);
    items.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return { items: items.slice(0, ceiling), overCeiling: items.length > ceiling };
}
