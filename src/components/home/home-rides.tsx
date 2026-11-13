import { useTranslations } from "next-intl";
import ridesPhoto from "@/assets/home/rides-kiz-kulesi.jpg";
import { PhotoSection } from "@/components/home/photo-section";

const DISTRICTS = ["district1", "district2", "district3", "district4"] as const;

export function HomeRides() {
  const t = useTranslations("Home.rides");
  return (
    <PhotoSection
      eyebrow={t("eyebrow")}
      title={t("title")}
      photo={ridesPhoto}
      alt={t("alt")}
      photoSide="right"
    >
      <p className="text-pretty text-foreground/90">{t("weekend")}</p>
      <p className="text-pretty text-foreground/90">{t("weekday")}</p>
      <ul className="flex flex-wrap gap-2">
        {DISTRICTS.map((d) => (
          <li
            key={d}
            className="rounded-full border px-3 py-1 text-sm text-muted-foreground"
          >
            {t(d)}
          </li>
        ))}
      </ul>
    </PhotoSection>
  );
}
