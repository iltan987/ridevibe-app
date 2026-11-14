"use client";

import { EllipsisVertical, Menu, Share, SquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { InstallVariant } from "@/lib/pwa/platform";

type GuideVariant = Exclude<InstallVariant, "prompt" | "none">;
type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const ICONS: Record<GuideVariant, [Icon, Icon, Icon]> = {
  "ios-safari": [Share, SquarePlus, SquarePlus],
  "ios-other": [Share, SquarePlus, SquarePlus],
  "android-manual": [EllipsisVertical, SquarePlus, SquarePlus],
  "desktop-safari": [Menu, SquarePlus, SquarePlus],
};

export function InstallGuideDialog({
  variant,
  open,
  onOpenChange,
}: {
  variant: GuideVariant;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const t = useTranslations("Install");
  const icons = ICONS[variant];
  const steps = [t(`steps.${variant}.1`), t(`steps.${variant}.2`), t(`steps.${variant}.3`)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("guideTitle")}</DialogTitle>
        </DialogHeader>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => {
            const StepIcon = icons[i];
            return (
              <li key={i} className="flex items-start gap-3">
                {/* The <ol> already numbers the steps for screen readers. */}
                <span
                  aria-hidden
                  className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <StepIcon className="size-4" aria-hidden />
                </span>
                <span className="pt-1 text-sm">{step}</span>
              </li>
            );
          })}
        </ol>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
