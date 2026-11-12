"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ClubBadge } from "@/components/brand/club-badge";
import { InstallGuideDialog } from "@/components/pwa/install-guide-dialog";
import { useInstall } from "@/components/pwa/use-install";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating "install the app" card above the phone tab bar (desktop: bottom right). It renders the same card a second
 * time in normal flow (invisible, inert) at the end of `<body>`, after the footer, so the page reserves exactly the
 * banner's height (plus its offset) and nothing ends up behind it. Client-only: the server snapshot never shows it.
 */
export function InstallBanner() {
  const { variant, banner, install, dismiss } = useInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const t = useTranslations("Install");

  if (!banner) return null;

  // Phones: 40px tap targets side by side, 8px apart, the primary action on the outer edge.
  const card = (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground shadow-lg">
      <div className="flex items-center gap-3">
        <ClubBadge className="w-10 shrink-0" sizes="40px" />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium">{t("bannerTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("bannerBody")}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="h-10 md:h-8" onClick={dismiss}>
          {t("notNow")}
        </Button>
        {variant === "prompt" ? (
          <Button className="h-10 md:h-8" onClick={() => void install()}>
            {t("install")}
          </Button>
        ) : (
          <Button className="h-10 md:h-8" onClick={() => setGuideOpen(true)}>
            {t("howTo")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div
        role="region"
        aria-label={t("bannerLabel")}
        className={cn(
          "fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 md:inset-x-auto md:right-4 md:bottom-4 md:w-96",
          "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4",
        )}
      >
        {card}
      </div>
      {/* Spacer: same card in flow at the end of <body> (after the footer on desktop), padded by the banner's offset:
          phones `main pb-20` already clears the tab bar, the safe area is added here; desktop adds bottom-4 + a gap. */}
      {createPortal(
        <div
          aria-hidden
          inert
          className="invisible px-3 pb-[env(safe-area-inset-bottom)] md:ml-auto md:w-96 md:px-0 md:pb-8"
        >
          {card}
        </div>,
        document.body,
      )}
      {variant !== "prompt" && variant !== "none" && (
        <InstallGuideDialog variant={variant} open={guideOpen} onOpenChange={setGuideOpen} />
      )}
    </>
  );
}
