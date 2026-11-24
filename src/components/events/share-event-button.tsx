import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { whatsAppShareUrl } from "@/lib/applications/contact";

/**
 * "WhatsApp'ta paylaş": `text` comes from `shareText` (organisers, spec §6) or `memberShareText` (members); both
 * end with the event link.
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
