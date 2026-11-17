// Run with: pnpm test
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { test } from "node:test";
import { backupFolderName, createMarkerCheck, DATA_MARKERS, expiredBackups, pruneBackups } from "./backup-files.mts";

test("backupFolderName: UTC time without colons or milliseconds", () => {
  const now = new Date("2026-11-15T21:04:05.123Z");
  assert.equal(backupFolderName(now, false), "2026-11-15T21-04-05Z");
  assert.equal(backupFolderName(now, true), "2026-11-15T21-04-05Z-local");
});

test("expiredBackups: older than the max age, and stale partial folders", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  const names = [
    "2026-11-15T21-04-05Z",
    "2026-11-01T00-00-00Z-local",
    "2026-11-29T22-00-00Z.partial",
    "2026-11-16T00-00-01Z",
    "2026-11-29T23-30-00Z.partial",
  ];
  assert.deepEqual(expiredBackups(names, now, 14), [
    "2026-11-15T21-04-05Z",
    "2026-11-01T00-00-00Z-local",
    "2026-11-29T22-00-00Z.partial",
  ]);
});

test("expiredBackups: never touches names it didn't create", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  assert.deepEqual(expiredBackups(["notes", "2026-11-01", "2026-11-01T00-00-00Z.bak", "restore-notes"], now, 14), []);
});

async function check(chunks: string[]) {
  const marker = createMarkerCheck(DATA_MARKERS);
  const output = await text(Readable.from(chunks).pipe(marker.transform));
  return { output, missing: marker.missing() };
}

test("createMarkerCheck: passes bytes through and finds a marker split across chunks", async () => {
  const chunks = ['COPY "pub', 'lic"."profiles" (a) FROM stdin;\n', "x\n"];
  const { output, missing } = await check(chunks);
  assert.equal(output, chunks.join(""));
  assert.deepEqual(missing, ['COPY "auth"."users"']);
});

test("createMarkerCheck: nothing missing when both markers occur", async () => {
  const { missing } = await check([
    'COPY "auth"."users" (id) FROM stdin;\n',
    'COPY "public"."profiles" (id) FROM stdin;',
  ]);
  assert.deepEqual(missing, []);
});

test("createMarkerCheck: an empty stream misses every marker", async () => {
  const { output, missing } = await check([]);
  assert.equal(output, "");
  assert.deepEqual(missing, [...DATA_MARKERS]);
});

test("pruneBackups: deletes expired folders, keeps the rest, returns what it deleted", async () => {
  const root = await mkdtemp(join(tmpdir(), "prune-test-"));
  try {
    for (const name of ["2026-11-01T00-00-00Z", "2026-11-29T00-00-00Z", "notes"]) await mkdir(join(root, name));
    const deleted = await pruneBackups(root, new Date("2026-11-30T00:00:00Z"));
    assert.deepEqual(deleted, ["2026-11-01T00-00-00Z"]);
    assert.deepEqual((await readdir(root)).sort(), ["2026-11-29T00-00-00Z", "notes"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pruneBackups: a missing backup folder is not an error", async () => {
  assert.deepEqual(await pruneBackups(join(tmpdir(), "prune-test-missing-folder"), new Date()), []);
});
