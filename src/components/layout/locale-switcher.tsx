"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations, type Locale } from "next-intl";
import { Suspense, useTransition } from "react";
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

// usePathname() suspends on routes with unknown dynamic params, so the
// interactive switcher streams in; the fallback is the same button, disabled.
export function LocaleSwitcher() {
  return (
    <Suspense fallback={<LocaleButton disabled />}>
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
    <Button
      variant="ghost"
      size="sm"
      aria-label={t("current", { code })}
      {...props}
    >
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

  function onChange(next: Locale) {
    startTransition(() => {
      // next-intl also stores the choice in the NEXT_LOCALE cookie.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<LocaleButton disabled={isPending} />} />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => onChange(value as Locale)}
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
