"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ClubBadge } from "@/components/brand/club-badge";
import { InstallGuideDialog } from "@/components/pwa/install-guide-dialog";
import { useInstall } from "@/components/pwa/use-install";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating "install the app" card above the phone tab bar. It renders the same card a second time in normal flow
 * (invisible, inert) so the page reserves exactly the banner's height at its end: put it as the LAST child of the page.
 */
export function InstallBanner() {
  const { variant, banner, install, dismiss } = useInstall();
  const [guideOpen, setGuideOpen] = useState(false);
  const t = useTranslations("Install");

  if (!banner) return null;

  const card = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-lg">
      <ClubBadge className="w-10 shrink-0" sizes="40px" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug font-medium">{t("bannerTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("bannerBody")}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {variant === "prompt" ? (
          <Button size="sm" onClick={() => void install()}>
            {t("install")}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setGuideOpen(true)}>
            {t("howTo")}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t("notNow")}
        </Button>
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
      {/* Spacer: same markup, in flow, so the last content never ends up behind the fixed card. */}
      <div aria-hidden inert className="invisible md:ml-auto md:w-96">
        {card}
      </div>
      {variant !== "prompt" && variant !== "none" && (
        <InstallGuideDialog variant={variant} open={guideOpen} onOpenChange={setGuideOpen} />
      )}
    </>
  );
}
