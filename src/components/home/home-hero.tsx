import Image from "next/image";
import { useTranslations } from "next-intl";
import heroRoad from "@/assets/home/hero-road.jpg";
import { HomeApplyButton } from "@/components/home/home-apply-button";

// Always dark: the `dark` class makes the tokens resolve to the night palette inside, so cream text sits on the
// photo's dark gradient in both themes and the bottom edge is straight against a cream page. The text is in flow
// (not absolutely positioned), so the hero grows with large text instead of clipping. The h1 is two fixed lines sized
// by viewport only: next/font's fallback is never condensed, so wrapping text would reflow at the Saira swap.
export function HomeHero() {
  const t = useTranslations("Home");
  return (
    <section
      data-home-hero
      className="dark relative flex min-h-160 flex-col justify-end overflow-hidden bg-background md:min-h-190"
    >
      <Image
        src={heroRoad}
        alt={t("heroAlt")}
        fill
        sizes="100vw"
        placeholder="blur"
        preload
        className="object-cover object-[38%_40%] md:object-[50%_38%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-b from-transparent from-35% via-background/90 via-80% to-background md:hidden"
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden bg-linear-to-r from-background/90 via-background/55 via-40% to-transparent to-70% md:block"
      />
      <div
        aria-hidden
        className="absolute inset-0 hidden bg-linear-to-b from-transparent from-65% to-background md:block"
      />
      <div className="relative mx-auto w-full max-w-5xl px-5 pb-14 md:px-8 md:pb-28">
        <div className="md:max-w-150">
          <h1 className="text-[min(23.5vw,5.75rem)] leading-[0.86] font-extrabold tracking-[-0.01em] text-foreground font-stretch-62% md:text-[min(13vw,10.5rem)]">
            {t.rich("title", { line: (chunks) => <span className="block whitespace-nowrap">{chunks}</span> })}
          </h1>
          <p className="mt-3.5 mb-4.5 max-w-[30ch] text-pretty text-foreground/90 md:mt-5 md:mb-6 md:max-w-[34ch] md:text-xl">
            {t("subtitle")}
          </p>
          <HomeApplyButton />
        </div>
      </div>
    </section>
  );
}
