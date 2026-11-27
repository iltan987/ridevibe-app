// Applicants under a year of riding answer 0 years and then the months (0-11).
export function asksRidingMonths(years: string | undefined) {
  const trimmed = years?.trim();
  return !!trimmed && Number(trimmed) === 0;
}
