import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PRIVACY_NOTICE_VERSION } from "@/lib/applications/options";
import { PrivacyEn } from "./content-en";
import { PrivacyTr } from "./content-tr";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Privacy")]);

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 text-[0.95rem] leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <p role="note" className="rounded-lg border border-sun/40 bg-sun/10 p-3 text-sm">
        {t("draftNotice")}
      </p>
      {locale === "tr" ? <PrivacyTr /> : <PrivacyEn />}
      <p className="mt-6 text-sm text-muted-foreground">{t("version", { version: PRIVACY_NOTICE_VERSION })}</p>
    </article>
  );
}
