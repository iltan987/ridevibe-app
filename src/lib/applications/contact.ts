/** False only for Turkish (+90) numbers that are not a mobile number (+905xxxxxxxxx). Foreign numbers pass. */
export function isTurkishMobileOrForeign(e164: string): boolean {
  if (!e164.startsWith("+90")) return true;
  return /^\+905\d{9}$/.test(e164);
}

/** True for Gmail / Google Mail addresses (the domain is compared trimmed and lowercased). */
export function isGoogleMailAddress(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop();
  return domain === "gmail.com" || domain === "googlemail.com";
}

/**
 * Same as `private.normalize_email` (00_private.sql): trimmed and lowercased; for Gmail/Google Mail the dots and
 * the `+tag` in the local part are dropped and the domain becomes gmail.com. Keep both in sync.
 */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const [local = "", domain = ""] = e.split("@");
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return `${local.split("+")[0].replaceAll(".", "")}@gmail.com`;
  }
  return e;
}

/** True when both addresses reach the same mailbox as far as account matching is concerned (`normalizeEmail`). */
export function sameEmail(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}
