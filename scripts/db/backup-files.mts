// Pure helpers for `production.mts`: backup folder names, which folders to prune, and a pass-through check that a
// dump contains the tables it must contain (run on the stream before gpg, so no plaintext is ever written).
import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";

export const BACKUP_MAX_AGE_DAYS = 14;

/** Lines a usable data dump must contain (`supabase db dump --data-only --use-copy` quotes every identifier). */
export const DATA_MARKERS = ['COPY "public"."profiles"', 'COPY "auth"."users"'] as const;

const PARTIAL_MAX_AGE_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const FOLDER_NAME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z(?:-local)?(?:\.partial)?$/;

export function backupFolderName(now: Date, local: boolean): string {
  const stamp = now.toISOString().slice(0, 19).replaceAll(":", "-");
  return `${stamp}Z${local ? "-local" : ""}`;
}

/** Folders to delete: backups older than `maxAgeDays`, and `.partial` leftovers older than an hour. */
export function expiredBackups(names: readonly string[], now: Date, maxAgeDays: number): string[] {
  return names.filter((name) => {
    const match = FOLDER_NAME.exec(name);
    if (!match) return false;
    const [, year, month, day, hour, minute, second] = match;
    const age = now.getTime() - Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
    return age > maxAgeDays * DAY_MS || (name.endsWith(".partial") && age > PARTIAL_MAX_AGE_MS);
  });
}

/** A pass-through stream that records which markers start a line. */
export function createMarkerCheck(markers: readonly string[]): { transform: Transform; missing(): string[] } {
  const keep = Math.max(0, ...markers.map((marker) => marker.length));
  const found = new Set<string>();
  const decoder = new StringDecoder("utf8");
  let lineStart = "";

  const endLine = () => {
    for (const marker of markers) if (lineStart.startsWith(marker)) found.add(marker);
    lineStart = "";
  };
  const scan = (text: string) => {
    const pieces = text.split("\n");
    pieces.forEach((piece, index) => {
      if (index > 0) endLine();
      if (lineStart.length < keep) lineStart += piece.slice(0, keep - lineStart.length);
    });
  };

  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      scan(decoder.write(chunk));
      callback(null, chunk);
    },
    flush(callback) {
      scan(decoder.end());
      endLine();
      callback();
    },
  });

  return { transform, missing: () => markers.filter((marker) => !found.has(marker)) };
}
