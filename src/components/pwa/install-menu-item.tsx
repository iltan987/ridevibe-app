"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useInstall } from "@/components/pwa/use-install";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/** "Install the app" entry for the avatar menu; renders nothing when installing isn't possible or is already done. */
export function InstallMenuItem({ onGuide }: { onGuide(): void }) {
  const { variant, install } = useInstall();
  const t = useTranslations("Install");

  if (variant === "none") return null;

  return (
    <DropdownMenuItem onClick={() => (variant === "prompt" ? void install() : onGuide())}>
      <Download aria-hidden />
      {t("menuItem")}
    </DropdownMenuItem>
  );
}
