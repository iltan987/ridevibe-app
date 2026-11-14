import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ApplyGate } from "@/components/apply/apply-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { pageMetadata } from "@/lib/seo/metadata";
import { cn } from "@/lib/utils";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Apply")]);
  const images = (await parent).openGraph?.images;
  return pageMetadata({
    locale,
    path: "/apply",
    title: t("title"),
    description: t("intro"),
    images,
  });
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
function Line({ className, bar }: { className?: string; bar: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <Skeleton className={bar} />
    </div>
  );
}

/** A row of choice pills; the container has the real (wrapped) height, so the pill widths only need to look right. */
function Pills({ widths, className, round = "rounded-lg" }: { widths: string[]; className: string; round?: string }) {
  return (
    <div className={cn("flex flex-wrap content-start gap-2", className)}>
      {widths.map((w, i) => (
        <Skeleton key={i} className={cn("h-10", w, round)} />
      ))}
    </div>
  );
}

/**
 * Mirrors the form's first step ("Riding") with its step header and button, i.e. what a signed-out visitor without a
 * draft sees (`data-skeleton-result="apply"` is the `<form>`). Signed-in members/applicants get a short notice instead
 * and accept a jump below the fold; a restored draft or `?step=N` opens another step (not mirrored).
 * Heights are measured (`skeletons.mjs`), Turkish and English alike: pills wrap on phones (licence 2 rows, styles 3,
 * from `md`: 1 and 2), the number input is h-10 on phones and h-9 from `md`.
 */
function ApplySkeleton() {
  return (
    <div data-skeleton="apply" className="flex flex-col gap-8">
      {/* Step header: heading line (text-lg) + progress bar. */}
      <div className="flex flex-col gap-3">
        <Line className="h-7" bar="h-5 w-40" />
        <Skeleton className="h-1.5 w-full rounded-full" />
      </div>
      <div className="flex flex-col gap-5">
        {/* Licence class */}
        <div className="flex h-29 flex-col gap-2 md:h-17">
          <Line className="h-5" bar="h-3.5 w-28" />
          <Pills widths={["w-20", "w-20", "w-18", "w-44", "w-30"]} className="h-full" />
        </div>
        {/* Riding years: label + narrow number input */}
        <div className="flex h-[67.25px] flex-col gap-2 md:h-[63.25px]">
          <Line className="h-[19.25px]" bar="h-3.5 w-52" />
          <Skeleton className="h-10 w-32 md:h-9" />
        </div>
        {/* Owns a motorcycle */}
        <div className="flex h-17 flex-col gap-2">
          <Line className="h-5" bar="h-3.5 w-32" />
          <Pills widths={["w-20", "w-20"]} className="h-full" />
        </div>
        {/* Riding styles: label + hint + chips (3 rows on phones, 2 from md) */}
        <div className="flex h-47.25 flex-col gap-1.5 md:h-35.25">
          <Line className="h-5" bar="h-3.5 w-24" />
          <Line className="h-[21px]" bar="h-3.5 w-1/2" />
          <Pills widths={["w-24", "w-40", "w-36", "w-20", "w-40", "w-24"]} className="h-full" round="rounded-full" />
        </div>
        {/* Group experience */}
        <div className="flex h-17 flex-col gap-2">
          <Line className="h-5" bar="h-3.5 w-40" />
          <Pills widths={["w-24", "w-24", "w-20"]} className="h-full" />
        </div>
      </div>
      {/* "Next" button */}
      <Skeleton className="h-11 w-full rounded-lg sm:w-28" />
    </div>
  );
}
