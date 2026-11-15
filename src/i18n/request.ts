import { hasLocale, type Locale, type Messages } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

// One loader per locale: each JSON stays its own chunk, and a static import keeps its type (a template-literal
// `import()` is `any`).
const MESSAGES = {
  tr: () => import("../../messages/tr.json"),
  en: () => import("../../messages/en.json"),
} satisfies Record<Locale, () => Promise<{ default: Messages }>>;

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale();
    if (!hasLocale(routing.locales, paramValue)) notFound();
    locale = paramValue;
  }

  return {
    locale,
    messages: (await MESSAGES[locale]()).default,
    timeZone: "Europe/Istanbul",
  };
});
