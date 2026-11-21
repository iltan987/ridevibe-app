import { useTranslations } from "next-intl";
import type { EventPlace } from "@/lib/events/queries";
import { cn } from "@/lib/utils";

type Role = "start" | "stop" | "finish" | "meetup";

function roleOf(index: number, count: number): Role {
  if (count === 1) return "meetup";
  if (index === 0) return "start";
  return index === count - 1 ? "finish" : "stop";
}

// Each marker sits in a 16px box, so the line runs between the first and last box centres (8px in from each edge).
const MARKER: Record<Role, string> = {
  start: "size-4 border-3 border-foreground bg-background",
  stop: "size-2 bg-foreground",
  finish: "size-3.5 bg-primary ring-2 ring-background",
  meetup: "size-3.5 bg-primary ring-2 ring-background",
};

/**
 * The route strip of the design system (no map base): start ring, stop dots, orange finish on an orange line with a
 * soft glow; a meet-up's single place is one orange dot. Under the markers the start and finish names (a meet-up's
 * one name); stop names are for screen readers only (a phone has no room for them). `labels={false}`: markers only,
 * pure decoration hidden from screen readers (the event card names the places in its meta line).
 */
export function RouteStrip({
  places,
  labels = true,
  className,
}: {
  places: EventPlace[];
  labels?: boolean;
  className?: string;
}) {
  const t = useTranslations("Events");
  if (places.length === 0) return null;
  const single = places.length === 1;

  return (
    <div
      aria-hidden={labels ? undefined : true}
      className={cn("flex h-24 flex-col justify-center gap-2 bg-muted/40 px-4", className)}
    >
      <div aria-hidden className={cn("relative flex h-4 items-center", single ? "justify-center" : "justify-between")}>
        {!single && (
          <>
            <span className="absolute inset-x-2 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-primary/25 blur-xs" />
            <span className="absolute inset-x-2 top-1/2 h-0.75 -translate-y-1/2 rounded-full bg-primary" />
          </>
        )}
        {places.map((_, i) => (
          <span key={i} className="relative flex size-4 items-center justify-center">
            <span className={cn("rounded-full", MARKER[roleOf(i, places.length)])} />
          </span>
        ))}
      </div>
      {labels && (
        <ol
          aria-label={t("route")}
          className={cn("flex gap-3 text-sm font-medium", single ? "justify-center" : "justify-between")}
        >
          {places.map((place, i) => {
            const role = roleOf(i, places.length);
            return (
              <li
                key={i}
                className={cn(
                  role === "stop" ? "sr-only" : "min-w-0 truncate",
                  role === "finish" && "text-right",
                  role === "meetup" && "text-center",
                )}
              >
                <span className="sr-only">{t(`placeRoles.${role}`)} </span>
                {place.name}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
