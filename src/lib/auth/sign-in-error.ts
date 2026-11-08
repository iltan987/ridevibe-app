import { hasLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Localized "/sign-in?error=oauth" for the language of `next` (a safe,
 * locale-prefixed path such as "/en/account"). Server Actions and Route
 * Handlers can't read the locale root param, so we derive it from `next`.
 */
export function signInErrorPath(next: string) {
  const first = next.split(/[/?#]/)[1];
  const locale = hasLocale(routing.locales, first) ? first : routing.defaultLocale;
  return getPathname({ href: { pathname: "/sign-in", query: { error: "oauth" } }, locale });
}
