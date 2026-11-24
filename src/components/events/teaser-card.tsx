import { MapPin } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { dayToDate } from "@/lib/events/day";
import type { Enums } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * An event as non-members see it (events release spec §3): the date block (weekday, day, month), the title (struck
 * through when cancelled), the area line (rides) and badges ("İptal edildi", kind, side). Public data only: no time,
 * place, count or link (`EventCard` is the members' version). `day` is the Istanbul day ("YYYY-MM-DD").
 * `headingLevel`: "h1" when the card is the page's subject (the event page), "h2" in lists.
 */
export function TeaserCard({
  title,
  day,
  kind,
  area,
  side = null,
  cancelled = false,
  headingLevel: Heading = "h2",
}: {
  title: string;
  day: string;
  kind: Enums<"event_kind">;
  area: string | null;
  side?: Enums<"istanbul_side"> | null;
  cancelled?: boolean;
  headingLevel?: "h1" | "h2";
}) {
  const t = useTranslations("Events");
  const tSides = useTranslations("Admin.sides");
  const format = useFormatter();
  const date = dayToDate(day);

  return (
    <article className="flex gap-4 rounded-xl border bg-card p-4">
      <time dateTime={day} className="flex w-12 shrink-0 flex-col items-center text-center">
        <span className="text-xs text-muted-foreground">{format.dateTime(date, { weekday: "short" })}</span>
        <span className="heading text-3xl tabular-nums">{format.dateTime(date, { day: "numeric" })}</span>
        <span className="text-xs font-semibold text-accent-text">{format.dateTime(date, { month: "short" })}</span>
      </time>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* User text: no `heading` (its CSS uppercase would turn an English "i" into "İ" on Turkish pages). */}
        <Heading
          className={cn("text-base font-semibold wrap-break-word", cancelled && "text-muted-foreground line-through")}
        >
          {title}
        </Heading>
        {area && (
          <p className="flex gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="wrap-break-word">
              <span className="sr-only">{t("detail.area")} </span>
              {area}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {cancelled && <Badge variant="destructive">{t("cancelled")}</Badge>}
          <Badge variant="secondary">{t(`kinds.${kind}`)}</Badge>
          {side && <Badge variant="outline">{tSides(side)}</Badge>}
        </div>
      </div>
    </article>
  );
}
