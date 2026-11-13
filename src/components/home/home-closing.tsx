import Image from "next/image";
import { useTranslations } from "next-intl";
import closingPhoto from "@/assets/home/closing-breakfast.jpg";
import { HomeApplyButton } from "@/components/home/home-apply-button";

// Always dark (like the hero). Phone: photo, then line and button below it. md+: the text sits over the photo's
// darkened lower part. Without the button (members) the line alone ends the page.
export function HomeClosing() {
  const t = useTranslations("Home.closing");
  return (
    <section
      data-home-closing
      className="dark relative bg-background text-foreground md:h-155 md:overflow-hidden"
    >
      <div className="relative h-90 w-full md:absolute md:inset-0 md:h-full">
        <Image
          src={closingPhoto}
          alt={t("alt")}
          fill
          sizes="100vw"
          placeholder="blur"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 hidden bg-linear-to-b from-background from-0% via-transparent via-30% to-transparent to-45% md:block"
        />
        <div
          aria-hidden
          className="absolute inset-0 hidden bg-linear-to-t from-background/90 from-0% to-transparent to-55% md:block"
        />
      </div>
      <div className="relative px-5 pt-6.5 pb-10 md:absolute md:inset-x-0 md:bottom-0 md:mx-auto md:max-w-5xl md:pt-0 md:pr-8 md:pb-20 md:pl-22">
        <p className="mb-5 text-[40px] leading-[0.95] font-extrabold text-balance [font-stretch:70%] md:mb-6.5 md:max-w-[14ch] md:text-[80px]">
          {t("line")}
        </p>
        <HomeApplyButton />
      </div>
    </section>
  );
}
