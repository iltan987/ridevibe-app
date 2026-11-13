import { useTranslations } from "next-intl";
import whoPhoto from "@/assets/home/who-terrace.jpg";
import { PhotoSection } from "@/components/home/photo-section";

export function HomeWho() {
  const t = useTranslations("Home.who");
  return (
    <PhotoSection
      eyebrow={t("eyebrow")}
      title={t("title")}
      photo={whoPhoto}
      alt={t("alt")}
      photoSide="left"
    >
      <p className="text-pretty text-foreground/90">{t("body")}</p>
      <p className="text-pretty text-sm text-muted-foreground">{t("conditions")}</p>
    </PhotoSection>
  );
}
