import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import { CardCounts } from "@/components/events/event-counts";
import { RouteStrip } from "@/components/events/route-strip";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { Counts } from "@/lib/events/join";
import type { EventSummary } from "@/lib/events/queries";
import { routeSummary } from "@/lib/events/places";
import { cn } from "@/lib/utils";

/**
 * An event in a list (design system §6): route strip on top (decoration: the meta line names the places), then the
 * date block, the title, "08:30 · start → finish", the counts line (with a capacity bar when a limit is set) and
 * badges ("cancelled", "Katılıyorsun" when `joined`, else "Gelmiyorsun" when `declined`, kind, side). A cancelled
 * event's title is struck through. The whole card links to the event; the link is named by the title and described by
 * the date, meta line and badges (screen readers hear the title first). `withYear`: past lists span years, so their
 * date block shows the year where upcoming ones show the weekday.
 */
export function EventCard({
  event,
  counts,
  joined = false,
  declined = false,
  withYear = false,
}: {
  event: EventSummary;
  counts: Counts;
  joined?: boolean;
  declined?: boolean;
  withYear?: boolean;
}) {
  const t = useTranslations("Events");
  const tSides = useTranslations("Admin.sides");
  const format = useFormatter();
  const start = new Date(event.startsAt);
  const cancelled = event.status === "cancelled";
  const places = routeSummary(event.places);
  const id = useId();
  const time = format.dateTime(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <Link
      href={`/events/${event.id}`}
      data-skeleton-result="events-row"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-date ${id}-meta ${id}-counts ${id}-badges`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <article className="overflow-hidden rounded-xl border bg-card transition-colors hover:bg-muted/40">
        <RouteStrip places={event.places} className="border-b" />
        <div className="flex gap-4 p-4">
          <time
            id={`${id}-date`}
            dateTime={event.startsAt}
            className="flex w-12 shrink-0 flex-col items-center text-center"
          >
            <span className="text-xs text-muted-foreground">
              {format.dateTime(start, withYear ? { year: "numeric" } : { weekday: "short" })}
            </span>
            <span className="heading text-3xl tabular-nums">{format.dateTime(start, { day: "numeric" })}</span>
            <span className="text-xs font-semibold text-accent-text">{format.dateTime(start, { month: "short" })}</span>
          </time>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2
              id={`${id}-title`}
              className={cn("text-base font-semibold", cancelled && "text-muted-foreground line-through")}
            >
              {event.title}
            </h2>
            <p id={`${id}-meta`} className="truncate text-sm text-muted-foreground">
              {places ? t("meta", { time, places }) : time}
            </p>
            <CardCounts
              id={`${id}-counts`}
              counts={counts}
              limits={{ people: event.limitPeople, bikes: event.limitBikes }}
            />
            <div id={`${id}-badges`} className="flex flex-wrap gap-1.5 pt-1">
              {cancelled && <Badge variant="destructive">{t("cancelled")}</Badge>}
              {joined ? (
                <Badge variant="status">{t("joinedBadge")}</Badge>
              ) : (
                declined && <Badge variant="outline">{t("declinedBadge")}</Badge>
              )}
              <Badge variant="secondary">{t(`kinds.${event.kind}`)}</Badge>
              {event.side && <Badge variant="outline">{tSides(event.side)}</Badge>}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
