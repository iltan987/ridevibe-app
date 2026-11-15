"use client";

import { Languages } from "lucide-react";
import { hasLocale, useLocale, useTranslations, type Locale } from "next-intl";
import { Suspense, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  followsLocaleChange,
  LOCALE_SYNC_KEY,
  localeEvent,
  localeOfEvent,
  localeSwitchedSince,
  tabChannel,
} from "@/lib/cross-tab";

// usePathname() suspends on routes with unknown dynamic params, so the
// interactive switcher streams in; the fallback is the same button, disabled.
export function LocaleSwitcher() {
  return (
    <Suspense fallback={<LocaleButton disabled data-skeleton="locale-switcher" />}>
      <LocaleSwitcherMenu />
    </Suspense>
  );
}

function LocaleButton(props: React.ComponentProps<typeof Button>) {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const code = locale.toUpperCase();
  // The accessible name must contain the visible text (WCAG 2.5.3 Label in
  // Name): "Dil: TR", so voice-control users can say "TR".
  return (
    <Button variant="ghost" size="sm" aria-label={t("current", { code })} {...props}>
      <Languages aria-hidden />
      {code}
    </Button>
  );
}

function LocaleSwitcherMenu() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // Follow a switch made in another tab (cross-tab.ts), keeping the query; pages with form input keep their language.
  // On mount, catch up with a switch made since this page loaded (a background tab hydrates only when first shown).
  useEffect(() => {
    const channel = tabChannel(LOCALE_SYNC_KEY);
    const follow = (next: string | null) => {
      if (!next || next === locale || !hasLocale(routing.locales, next) || !followsLocaleChange(pathname)) return;
      startTransition(() => {
        router.replace(`${pathname}${window.location.search}`, { locale: next });
      });
    };
    follow(localeSwitchedSince(channel.current() ?? "", performance.timeOrigin));
    return channel.subscribe((value) => follow(localeOfEvent(value)));
  }, [locale, pathname, router]);

  function onChange(next: Locale) {
    tabChannel(LOCALE_SYNC_KEY).publish(localeEvent(next, Date.now()));
    startTransition(() => {
      // next-intl also stores the choice in the NEXT_LOCALE cookie.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<LocaleButton disabled={isPending} data-skeleton-result="locale-switcher" />} />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => {
              if (hasLocale(routing.locales, value)) onChange(value); // only our own locales can be checked
            }}
          >
            {routing.locales.map((l) => (
              <DropdownMenuRadioItem key={l} value={l}>
                {t(l)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
