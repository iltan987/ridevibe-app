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
