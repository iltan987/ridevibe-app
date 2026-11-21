"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";
import { whatsAppShareUrl } from "@/lib/applications/contact";
import { noSubscribe } from "@/lib/no-subscribe";

const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

/**
 * "WhatsApp'ta paylaş" (organisers, spec §6): `text` (from `shareText`) plus the event's absolute link, built from the
 * browser's origin and the localized `path`. Until hydration the link has no target (the origin is unknown).
 */
export function ShareEventButton({ text, path }: { text: string; path: string }) {
  const t = useTranslations("Events.detail");
  const origin = useSyncExternalStore(noSubscribe, getOrigin, getServerOrigin);
  const href = origin === null ? undefined : whatsAppShareUrl(`${text}\n${origin}${path}`);

  return (
    <a href={href} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
      <MessageCircle data-icon="inline-start" aria-hidden />
      {t("share")}
    </a>
  );
}
