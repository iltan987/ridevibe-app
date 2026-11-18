// Whole calendar days (Europe/Istanbul) an account has been in its current status. Dependency-free so `node --test`
// can run its tests; `now` is a parameter so callers decide when "now" is.

const istanbulDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" });

/** The Istanbul calendar date of an instant as a day number (days since 1970-01-01). */
function dayNumber(instant: Date): number {
  const [year, month, day] = istanbulDay.format(instant).split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Calendar days between `since` and `now` in Istanbul: 0 on the same day, 1 after the next midnight there. */
export function daysSince(since: Date, now: Date): number {
  return Math.max(0, dayNumber(now) - dayNumber(since));
}
