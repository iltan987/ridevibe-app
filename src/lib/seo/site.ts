import type { Locale } from "next-intl";

export const SITE_URL = "https://ridevibe.com.tr";
export const SITE_NAME = "Ride & Vibe";
export const SITE_ALTERNATE_NAME = "Ride and Vibe";
export const INSTAGRAM_URL = "https://www.instagram.com/rideandvibe34/";
export const LOGO_URL = `${SITE_URL}/brand/icon-512.png`;

export type PagePath = "/" | "/apply" | "/privacy" | "/events" | "/gallery";

/** Absolute URL of a public page: Turkish is served at the root, English under `/en`. */
export function localizedUrl(locale: Locale, path: PagePath): string {
  if (locale === "tr") return `${SITE_URL}${path}`;
  return path === "/" ? `${SITE_URL}/en` : `${SITE_URL}/en${path}`;
}

/** Absolute URL of an event page (always the production site: links are only shared from there). */
export function eventUrl(locale: Locale, id: string): string {
  return `${SITE_URL}${locale === "tr" ? "" : "/en"}/events/${id}`;
}

export function ogLocale(locale: Locale): "tr_TR" | "en_US" {
  return locale === "tr" ? "tr_TR" : "en_US";
}
