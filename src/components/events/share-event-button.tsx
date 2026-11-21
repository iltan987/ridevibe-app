import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { whatsAppShareUrl } from "@/lib/applications/contact";

/**
 * "WhatsApp'ta paylaş" (organisers, spec §6): `text` comes from `shareText`. It carries no event link until the joining
 * branch releases Events (members would meet sign-in and a 404); put the link back then (docs/follow-ups.md).
 */
export function ShareEventButton({ text }: { text: string }) {
  const t = useTranslations("Events.detail");

  return (
    <a
      href={whatsAppShareUrl(text)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "outline" })}
    >
      <MessageCircle data-icon="inline-start" aria-hidden />
      {t("share")}
    </a>
  );
}
