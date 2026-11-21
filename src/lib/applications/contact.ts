/** False only for Turkish (+90) numbers that are not a mobile number (+905xxxxxxxxx). Foreign numbers pass. */
export function isTurkishMobileOrForeign(e164: string): boolean {
  if (!e164.startsWith("+90")) return true;
  return /^\+905\d{9}$/.test(e164);
}

/**
 * WhatsApp chat link, optionally with a prefilled message. Uses api.whatsapp.com, not wa.me: on desktop wa.me
 * redirects there and turns every emoji in `text` into "�" (U+FFFD) on the way; phones open wa.me in the app directly.
 */
export function whatsAppUrl(phone: string, text?: string): string {
  const url = `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}`;
  return text === undefined ? url : `${url}&text=${encodeURIComponent(text)}`;
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

/** WhatsApp share link without a recipient (the sender picks a chat or group); same api.whatsapp.com rule as above. */
export function whatsAppShareUrl(text: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
