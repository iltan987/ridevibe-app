// Birth-date rules shared by the application form and the profile (same as the DB: after 1920-01-01, 18+ by the
// Istanbul date; see applications_before_insert and set_my_birth_date). Dates are `YYYY-MM-DD` strings, so plain
// string comparison orders them correctly.

/** Birth dates must be strictly after this day. */
export const EARLIEST_BIRTH_DATE_EXCLUSIVE = "1920-01-01";
/** The earliest allowed birth date (input `min`). */
export const EARLIEST_BIRTH_DATE = "1920-01-02";

/** Today's date in Istanbul as `YYYY-MM-DD`. */
export function istanbulToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

/** The latest birth date of someone who is 18 today (input `max`). */
export function latestAdultBirthDate(today = istanbulToday()) {
  const [y, m, d] = today.split("-").map(Number);
  return `${String(y - 18).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isAtLeast18(birthDate: string, today = istanbulToday()) {
  return birthDate <= latestAdultBirthDate(today);
}
