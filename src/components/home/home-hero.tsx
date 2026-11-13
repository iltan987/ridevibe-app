import Image from "next/image";
import { useTranslations } from "next-intl";
import heroRoad from "@/assets/home/hero-road.jpg";
import { ClubBadge } from "@/components/brand/club-badge";
import { HomeApplyButton } from "@/components/home/home-apply-button";

// Always dark: the `dark` class makes the tokens resolve to the night palette inside, so cream text sits on the
// photo's dark gradient in both themes.
export function HomeHero() {
  const t = useTranslations("Home");
  return (
    <section data-home-hero className="dark relative h-[560px] overflow-hidden bg-background md:h-[720px]">
      <Image
        src={heroRoad}
        alt={t("heroAlt")}
        fill
        sizes="100vw"
        placeholder="blur"
        preload
        className="object-cover object-[38%_50%] md:object-[50%_40%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-b from-transparent via-background/55 via-45% to-background/95 md:bg-linear-to-r md:from-background/90 md:via-background/60 md:via-45% md:to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 hidden h-40 bg-linear-to-b from-transparent to-background md:block"
      />
      <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col justify-end gap-4 px-4 pb-10 md:pb-16">
        <ClubBadge sizes="(min-width: 768px) 84px, 64px" className="w-16 md:w-21" />
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1 className="heading text-5xl leading-[1.05] text-balance text-foreground sm:text-7xl">
          {t("title")}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-foreground/90">{t("subtitle")}</p>
        <div>
          <HomeApplyButton />
        </div>
      </div>
    </section>
  );
}
