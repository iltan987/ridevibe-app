"use client";

import { Monitor, Moon, Sun, SunMoon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useState } from "react";
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
import {
  applyThemePreference,
  parseThemePreference,
  readThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS = [
  { value: "system", Icon: Monitor },
  { value: "dark", Icon: Moon },
  { value: "light", Icon: Sun },
] as const satisfies readonly { value: ThemePreference; Icon: unknown }[];

export function ThemeSwitcher() {
  const t = useTranslations("Theme");
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  // The inline <head> script sets the class during parsing; in dev, Strict Mode's remount resets <html>
  // attributes, so re-apply the stored preference before paint (no-op in production).
  useLayoutEffect(() => {
    applyThemePreference(readThemePreference());
  }, []);

  // Follow the OS setting live while on "system".
  useEffect(() => {
    if (pref !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemePreference("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);

  function onChange(value: string) {
    const next = parseThemePreference(value);
    applyThemePreference(next);
    setPref(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("label")}>
            <SunMoon aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={pref} onValueChange={onChange}>
            {OPTIONS.map(({ value, Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon aria-hidden />
                {t(value)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
