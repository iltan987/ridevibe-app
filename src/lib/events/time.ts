// Event times are Istanbul wall times. Turkey has been on UTC+03:00 all year since 2016 (no DST), so a fixed offset
// is exact and independent of the machine's time zone.

const OFFSET_HOURS = 3;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "YYYY-MM-DDTHH:mm" (Istanbul wall time) → ISO UTC string; null when malformed or not a real date. */
export function istanbulToIso(local: string): string | null {
  const m = WALL.exec(local);
  if (m === null) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour - OFFSET_HOURS, minute));
  const back = new Date(utc.getTime() + OFFSET_HOURS * 3_600_000);
  const roundTrips =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day &&
    back.getUTCHours() === hour &&
    back.getUTCMinutes() === minute;
  return roundTrips ? utc.toISOString() : null;
}

/** ISO instant → "YYYY-MM-DDTHH:mm" Istanbul wall time (for `datetime-local`). */
export function isoToIstanbul(iso: string): string {
  const t = new Date(iso).getTime() + OFFSET_HOURS * 3_600_000;
  const d = new Date(t);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
