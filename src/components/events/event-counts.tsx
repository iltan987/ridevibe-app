import { Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { type Counts, countsLine } from "@/lib/events/join";
import { cn } from "@/lib/utils";

type Limits = { people: number | null; bikes: number | null };

/**
 * The event page's counts line ("18 / 20 kişi · 12 / 15 motor") as one of the header's meta lines. `showOver`
 * (organisers): a red "Sınır aşıldı" when a count passes its limit, e.g. after the organiser lowered it.
 */
export function EventCounts({ counts, limits, showOver }: { counts: Counts; limits: Limits; showOver: boolean }) {
  const t = useTranslations("Events.counts");
  const line = countsLine(counts, limits);
  return (
    <p data-skeleton-result="event-counts" className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Users aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="tabular-nums">
        <span className="sr-only">{t("label")} </span>
        {t("line", { people: line.people, bikes: line.bikes })}
      </span>
      {showOver && line.over && <Badge variant="destructive">{t("over")}</Badge>}
    </p>
  );
}

/**
 * The card's counts line with a capacity bar when a limit is set (design system §6). The bar shows the fuller of
 * the two limits; it is decoration, the text carries the numbers.
 */
export function CardCounts({ counts, limits, id }: { counts: Counts; limits: Limits; id?: string }) {
  const t = useTranslations("Events.counts");
  const line = countsLine(counts, limits);
  const ratios = [
    limits.people === null ? null : counts.people / limits.people,
    limits.bikes === null ? null : counts.bikes / limits.bikes,
  ].filter((ratio) => ratio !== null);
  const fill = ratios.length > 0 ? Math.min(1, Math.max(...ratios)) : null;

  return (
    <div className="flex h-5 items-center gap-3 text-sm text-muted-foreground">
      <p id={id} className="shrink-0 tabular-nums">
        {t("line", { people: line.people, bikes: line.bikes })}
      </p>
      {fill !== null && (
        <div aria-hidden className="h-1.5 max-w-32 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", fill >= 1 ? "bg-primary" : "bg-status")}
            style={{ width: `${Math.round(fill * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
