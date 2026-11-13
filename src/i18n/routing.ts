import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // Turkish lives at "/", English at "/en".
  localePrefix: "as-needed",
  // Remember the language for a year (default: a session cookie). Name/sameSite keep next-intl's defaults.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});
