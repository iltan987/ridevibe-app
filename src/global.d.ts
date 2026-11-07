import type { routing } from "@/i18n/routing";
import type messages from "../messages/tr.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    // Turkish is the source language; other locales must have the same keys.
    Messages: typeof messages;
  }
}
