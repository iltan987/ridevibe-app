// Applicants under a year of riding answer 0 years and then the months (0-11).
export function asksRidingMonths(years: string | undefined) {
  const trimmed = years?.trim();
  return !!trimmed && Number(trimmed) === 0;
}

export type RidingExperience =
  { key: "years"; years: number } | { key: "months"; months: number } | { key: "underMonth" } | { key: "underYear" };

// Staff label: whole years, else the months, else "under a month" (0 months) or "under a year" (old rows, no months).
export function ridingExperience(years: number, months: number | null): RidingExperience {
  if (years > 0) return { key: "years", years };
  if (months === null) return { key: "underYear" };
  if (months === 0) return { key: "underMonth" };
  return { key: "months", months };
}
