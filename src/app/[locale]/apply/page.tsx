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
      <Suspense fallback={<ApplySkeleton />}>
        <ApplyGate />
      </Suspense>
    </section>
  );
}

/** A text line of fixed height (the real line box), with a bar centred in it. */
function Line({ className, bar }: { className: string; bar: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Skeleton className={bar} />
    </div>
  );
}

/** Label + input (+ hint). Heights are the real ones: inputs are h-10 on phones, h-9 from md; hints wrap on phones. */
function InputRow({ input = "h-10 md:h-9", hint }: { input?: string; hint?: "one" | "wrap" }) {
  return (
    <div className="flex flex-col gap-2">
      <Line className="h-[19.25px]" bar="h-3.5 w-28" />
      <Skeleton className={input} />
      {hint === "one" && <Line className="h-[21px]" bar="h-3.5 w-3/4" />}
      {hint === "wrap" && <Line className="h-[42px] md:h-[21px]" bar="h-3.5 w-3/4" />}
    </div>
  );
}

/**
 * Mirrors the first section ("About you") of the application form, i.e. what a signed-out visitor sees. Signed-in
 * members/applicants get a short notice instead and accept a jump below the fold.
 */
function ApplySkeleton() {
  return (
    <div data-skeleton="apply" className="flex flex-col">
      <Line className="mb-1.5 h-6" bar="h-5 w-36" />
      <div className="flex flex-col gap-5">
        <InputRow hint="one" />
        <InputRow hint="wrap" />
        <InputRow hint="wrap" />
        <InputRow hint="wrap" />
        <div className="flex h-[68px] flex-col gap-2">
          <Line className="h-5" bar="h-3.5 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
        <InputRow input="h-10 md:h-8" />
        <InputRow />
        <div className="flex h-[93px] flex-col gap-1.5">
          <Line className="h-5" bar="h-3.5 w-28" />
          <Line className="h-[21px]" bar="h-3.5 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-20 rounded-full" />
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-10 w-16 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
