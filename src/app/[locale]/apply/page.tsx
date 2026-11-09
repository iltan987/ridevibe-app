import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ApplyGate } from "@/components/apply/apply-gate";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Apply");
  return { title: t("title"), description: t("intro") };
}

export default function ApplyPage() {
  const t = useTranslations("Apply");

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="heading text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>
      {/* Request-time: the gate reads the session (signed-in prefill / notices)
          and the form reads UTM params from the URL (ad attribution). */}
      <Suspense fallback={<Skeleton className="h-[60rem] w-full rounded-xl" />}>
        <ApplyGate />
      </Suspense>
    </section>
  );
}
