import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";
import { RouteStrip } from "@/components/events/route-strip";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { EventSummary } from "@/lib/events/queries";
import { cn } from "@/lib/utils";

/**
 * An event in a list (design system §6): route strip on top (decoration: the meta line names the places), then the
 * date block, the title, "08:30 · start → finish" and badges (kind, side, "cancelled"). A cancelled event's title is
 * struck through. The whole card links to the event; the link is named by the title and described by the date, meta
 * line and badges (screen readers hear the title first). `withYear`: past lists span years, so their date block shows the year where upcoming ones show the
 * weekday.
 */
export function EventCard({ event, withYear = false }: { event: EventSummary; withYear?: boolean }) {
  const t = useTranslations("Events");
  const tSides = useTranslations("Admin.sides");
  const format = useFormatter();
  const start = new Date(event.startsAt);
  const cancelled = event.status === "cancelled";
  const first = event.places.at(0);
  const last = event.places.at(-1);
  const places = first && last && event.places.length > 1 ? `${first.name} → ${last.name}` : (first?.name ?? "");
  const id = useId();
  const time = format.dateTime(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <Link
      href={`/events/${event.id}`}
      data-skeleton-result="events-row"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-date ${id}-meta ${id}-badges`}
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <article className="overflow-hidden rounded-xl border bg-card transition-colors hover:bg-muted/40">
        <RouteStrip places={event.places} labels={false} className="border-b" />
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
            <div id={`${id}-badges`} className="flex flex-wrap gap-1.5 pt-1">
              {cancelled && <Badge variant="destructive">{t("cancelled")}</Badge>}
              <Badge variant="secondary">{t(`kinds.${event.kind}`)}</Badge>
              {event.side && <Badge variant="outline">{tSides(event.side)}</Badge>}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
