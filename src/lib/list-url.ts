// Builds the query string of a list URL, leaving out empty and default values (clean, shareable URLs).
// Dependency-free so `node --test` can run its tests.

export function listSearch(
  values: Record<string, string | number | null | undefined>,
  defaults: Record<string, string | number>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    if (key in defaults && String(defaults[key]) === String(value)) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
