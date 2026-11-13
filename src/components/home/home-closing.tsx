import Image from "next/image";
import { useTranslations } from "next-intl";
import closingPhoto from "@/assets/home/closing-breakfast.jpg";
import { HomeApplyButton } from "@/components/home/home-apply-button";

export function HomeClosing() {
  const t = useTranslations("Home.closing");
  return (
    <section data-home-closing className="pt-7 pb-10 md:pt-18 md:pb-16">
      <div className="relative h-[220px] w-full md:h-[420px]">
        <Image
          src={closingPhoto}
          alt={t("alt")}
          fill
          sizes="100vw"
          placeholder="blur"
          className="object-cover"
        />
      </div>
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 pt-7 text-center md:pt-10">
        <p className="text-xl font-extrabold text-balance md:text-3xl">{t("line")}</p>
        <HomeApplyButton />
      </div>
    </section>
  );
}
