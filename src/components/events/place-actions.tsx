"use client";

import { Check, ChevronDown, Copy, MapPin, Navigation, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { navLinks } from "@/lib/events/nav-links";
import type { EventPlace } from "@/lib/events/queries";

type App = "google" | "apple" | "yandex" | "yandexNavi";

/**
 * One place of an event (spec §4 "Opening a place"): its role ("Başlangıç"), name and venue label, then "Konumu aç"
 * and "Yol tarifi" menus with the map apps, and "Koordinatları kopyala" when the place has a point. Both menus are
 * described by the place name, so a screen reader tells the places' buttons apart.
 */
export function PlaceActions({ place, label }: { place: EventPlace; label: string }) {
  const t = useTranslations("Events.detail");
  const nameId = useId();
  const links = navLinks(place);
  const { coords } = links;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span id={nameId} className="font-medium wrap-break-word">
          {place.name}
        </span>
        {place.venueLabel && place.venueLabel !== place.name && (
          <span className="text-sm wrap-break-word text-muted-foreground">{place.venueLabel}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <AppMenu
          label={t("openPlace")}
          icon={MapPin}
          describedBy={nameId}
          links={[
            ["google", links.open.google],
            ["apple", links.open.apple],
            ["yandex", links.open.yandex],
          ]}
        />
        <AppMenu
          label={t("directions")}
          icon={Navigation}
          describedBy={nameId}
          links={[
            ["google", links.route.google],
            ["apple", links.route.apple],
            ["yandex", links.route.yandex],
            // Navi can't route to a search: only a place with a point offers it.
            ...(links.route.yandexNavi === null ? [] : [["yandexNavi", links.route.yandexNavi] as const]),
          ]}
        />
        {coords !== null && <CopyCoords coords={coords} describedBy={nameId} />}
      </div>
    </div>
  );
}

function AppMenu({
  label,
  icon: Icon,
  describedBy,
  links,
}: {
  label: string;
  icon: LucideIcon;
  describedBy: string;
  links: (readonly [App, string])[];
}) {
  const t = useTranslations("Events.detail.apps");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-describedby={describedBy} render={<Button variant="outline" size="sm" />}>
        <Icon data-icon="inline-start" aria-hidden />
        {label}
        <ChevronDown data-icon="inline-end" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        {links.map(([app, href]) => (
          <DropdownMenuLinkItem
            key={app}
            href={href}
            // The Navi app opens through its own scheme; a new tab would stay blank.
            {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {t(app)}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Copies "lat, lng"; where the Clipboard API is blocked (some webviews) it shows the text to select instead. */
function CopyCoords({ coords, describedBy }: { coords: string; describedBy: string }) {
  const t = useTranslations("Events.detail");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(coords);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" aria-describedby={describedBy} onClick={() => void copy()}>
        {copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
        {copied ? t("copied") : t("copyCoords")}
      </Button>
      <span className="sr-only" aria-live="polite">
        {copied ? t("copied") : ""}
      </span>
      {copyFailed && (
        <label className="flex w-full flex-col gap-1 text-sm text-muted-foreground">
          {t("copyManually")}
          <Input readOnly value={coords} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </>
  );
}
