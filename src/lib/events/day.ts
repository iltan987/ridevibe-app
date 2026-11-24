const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "YYYY-MM-DD" (an Istanbul calendar day, as the public RPCs return it) → a Date at 12:00 UTC, which is 15:00 in
 * Istanbul: the same day there and in every nearby zone, so formatting it with any time zone near Istanbul keeps the
 * day. Throws on anything that is not a real date.
 */
export function dayToDate(day: string): Date {
  const m = DAY.exec(day);
  if (m === null) throw new Error("Not a YYYY-MM-DD day");
  const [year, month, date] = m.slice(1).map(Number);
  const result = new Date(Date.UTC(year, month - 1, date, 12));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== date) {
    throw new Error("Not a real day");
  }
  return result;
}
