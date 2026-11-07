import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // Turkish lives at "/", English at "/en".
  localePrefix: "as-needed",
});
