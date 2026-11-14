// Motorcycle plates. Dependency-free so `node --test` can run it. The same rules are enforced by the DB check
// `member_motorcycles_plate`; keep both in sync.

const TURKISH_PLATE = /^(0[1-9]|[1-7][0-9]|8[01]) [A-Z]{1,3} [0-9]{2,4}$/;
const FOREIGN_PLATE = /^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$/;
const TURKISH_PARTS = /^(\d{2})([A-Z]{1,3})(\d{2,4})$/;

/**
 * Canonical plate text. Empty → null; anything that isn't a valid plate → "invalid".
 * Turkish: "34abc123" / "34-ABC-123" → "34 ABC 123". Foreign: upper-cased, spaces collapsed.
 */
export function normalizePlate(raw: string, foreign: boolean): string | null {
  if (!raw.trim()) return null;
  if (foreign) {
    const value = raw.trim().replace(/\s+/g, " ").toUpperCase();
    return FOREIGN_PLATE.test(value) ? value : "invalid";
  }
  const parts = TURKISH_PARTS.exec(raw.replace(/[\s-]/g, "").toUpperCase());
  if (!parts) return "invalid";
  const value = `${parts[1]} ${parts[2]} ${parts[3]}`;
  return TURKISH_PLATE.test(value) ? value : "invalid";
}
