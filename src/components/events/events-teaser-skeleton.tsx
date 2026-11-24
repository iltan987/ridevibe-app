import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One `TeaserCard` of a ride: the date block (weekday, day, month: 16 + 36 + 16px) beside title, area line and badge
 * row (24 + 20 + 24px, `gap-1`).
 */
function TeaserCardSkeleton() {
  return (
    <div data-skeleton="events-teaser-row" className="flex gap-4 rounded-xl border bg-card p-4">
      <Skeleton className="h-17 w-12 shrink-0" />
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14 rounded-4xl" />
          <Skeleton className="h-5 w-20 rounded-4xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback of `/events` for signed-out visitors (`EventsTeaser`): the heading and intro as real text (they never
 * change, so their height matches in every locale and width; the heading is no `h1` here), the total line, three
 * ride cards and the two buttons ("Kulübe Başvur", "Giriş yap"; `lg`, 36px). Sections are `gap-6` apart.
 */
export function EventsTeaserSkeleton() {
  const t = useTranslations("Events");
  return (
    <div data-skeleton="events-teaser" className="flex flex-col gap-6">
      <div data-skeleton="events-teaser-intro" className="flex flex-col gap-3">
        <p className="heading text-3xl">{t("title")}</p>
        <p className="text-muted-foreground">{t("teaser.intro")}</p>
      </div>
      <div data-skeleton="events-teaser-total" className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <TeaserCardSkeleton key={i} />
        ))}
      </div>
      <div data-skeleton="events-teaser-actions" className="flex gap-2">
        <Skeleton className="h-9 w-30" />
        <Skeleton className="h-9 w-22" />
      </div>
    </div>
  );
}
