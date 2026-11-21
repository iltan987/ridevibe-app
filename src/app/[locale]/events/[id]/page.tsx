import { Ban, CalendarDays, MapPin, Pencil } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelEventDialog } from "@/components/events/cancel-event-dialog";
import { ChangeLog, describeChanges } from "@/components/events/change-log";
import { DeleteEventDialog } from "@/components/events/delete-event-dialog";
import { EventCounts } from "@/components/events/event-counts";
import { EventRoster } from "@/components/events/event-roster";
import { JoinPanel } from "@/components/events/join-panel";
import { PlaceActions } from "@/components/events/place-actions";
import { RouteStrip } from "@/components/events/route-strip";
import { ShareEventButton } from "@/components/events/share-event-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { requireEventsAccess } from "@/lib/events/access";
import { NO_COUNTS } from "@/lib/events/join";
import {
  getChangeLog,
  getEvent,
  getEventCounts,
  getMyJoinContext,
  getMySignups,
  getRoster,
} from "@/lib/events/queries";
import { shareText } from "@/lib/events/places";
import { isUuid } from "@/lib/events/signup-rows";
import { isUpcoming } from "@/lib/events/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Events");
  return { title: t("title"), robots: { index: false } };
}

// The event, its counts, joining, the change box, its places with the map-app menus, the roster per viewer (spec §3),
// sharing, cancel and delete. Organisers only during the release gate (spec §9): everyone else gets a 404 (RLS returns
// no row anyway), so the page's content sits inside the boundary.
export default async function EventPage({ params }: PageProps<"/[locale]/events/[id]">) {
  const t = await getTranslations("Events");
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("backToList")}
      </Link>
      <Suspense fallback={<EventSkeleton />}>
        <EventContent params={params} />
      </Suspense>
    </section>
  );
}

/** Start date and time; a range when the event has an end (Intl drops the repeated day of a same-day range). */
const WHEN = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as const;

/** The share text's date line: the year goes, the reader knows it. */
const SHARE_WHEN = {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
} as const;

async function EventContent({ params }: { params: PageProps<"/[locale]/events/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireEventsAccess(`/events/${id}`);
  // A malformed id is no event (the counts RPC would otherwise fail on the uuid cast and show the error page).
  if (!isUuid(id)) notFound();
  // Viewers (spec §3): organisers see everyone with flags; active members the active participants' names while the
  // event is upcoming; ön alım members counts only. Every viewer here is active or ön alım (the gate).
  const organiser = can(user.access, "events.manage");
  const probation = user.profile?.status === "probation";

  const [event, counts, roster, changeLog, mySignups, joinContext, t, tSides, format] = await Promise.all([
    getEvent(id),
    getEventCounts([id]),
    probation ? null : getRoster(id),
    getChangeLog(id),
    getMySignups(),
    getMyJoinContext(),
    getTranslations("Events"),
    getTranslations("Admin.sides"),
    getFormatter(),
  ]);
  if (!event) notFound();

  const now = Date.now(); // eslint-disable-line react-hooks/purity -- request time (after the session read): joining closes at the start
  const eventCounts = counts.get(event.id) ?? NO_COUNTS;
  const changes = await describeChanges(changeLog.entries, { meetup: event.kind === "meetup" });
  if (changeLog.overCeiling) console.error("event change log over ceiling");
  const showRoster = roster !== null && (organiser || isUpcoming(event, now));

  const cancelled = event.status === "cancelled";
  const start = new Date(event.startsAt);
  const when = event.endsAt ? format.dateTimeRange(start, new Date(event.endsAt), WHEN) : format.dateTime(start, WHEN);
  const text = shareText(event, {
    when: format.dateTime(start, SHARE_WHEN),
    cancelledTitle: (title) => t("detail.shareCancelled", { title }),
    changeLead: changes.lead,
  });
  const single = event.places.length === 1;
  // A meet-up's one place needs no role: the section heading says "Buluşma yeri".
  const roleLabel = (i: number) => {
    if (single) return null;
    if (i === 0) return t("detail.roles.start");
    return i === event.places.length - 1 ? t("detail.roles.finish") : t("detail.roles.stop", { n: i });
  };
  const requirements = [
    event.limitPeople !== null && t("detail.limitPeople", { count: event.limitPeople }),
    event.limitBikes !== null && t("detail.limitBikes", { count: event.limitBikes }),
    event.minCc !== null && t("detail.minCc", { cc: event.minCc }),
    event.fullMembersOnly && t("detail.fullMembersOnly"),
  ].filter((line) => line !== false);

  return (
    <div data-skeleton-result="event" className="flex flex-col gap-6">
      {cancelled && (
        <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">{t("cancelled")}</p>
            {event.cancelReason && <p className="wrap-break-word whitespace-pre-wrap">{event.cancelReason}</p>}
          </div>
        </div>
      )}

      <header data-skeleton-result="event-header" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{t(`kinds.${event.kind}`)}</Badge>
          {event.side && <Badge variant="outline">{tSides(event.side)}</Badge>}
        </div>
        {/* User text: no `heading` (its CSS uppercase would turn an English "i" into "İ" on Turkish pages). */}
        <h1 className="text-2xl font-bold tracking-tight wrap-break-word">{event.title}</h1>
        <div className="flex flex-col gap-1.5 text-sm">
          <p className="flex gap-2">
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="sr-only">{t("detail.when")} </span>
              <time dateTime={event.startsAt}>{when}</time>
            </span>
          </p>
          {event.area && (
            <p className="flex gap-2">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="wrap-break-word">
                <span className="sr-only">{t("detail.area")} </span>
                {event.area}
              </span>
            </p>
          )}
          <EventCounts
            counts={eventCounts}
            limits={{ people: event.limitPeople, bikes: event.limitBikes }}
            showOver={organiser}
          />
        </div>
      </header>

      {organiser && (
        <div data-skeleton-result="event-actions" className="flex flex-wrap gap-2">
          {!cancelled && (
            <Link href={`/events/${event.id}/edit`} className={buttonVariants({ variant: "outline" })}>
              <Pencil data-icon="inline-start" aria-hidden />
              {t("detail.edit")}
            </Link>
          )}
          <ShareEventButton text={text} />
        </div>
      )}

      <JoinPanel
        eventId={event.id}
        event={event}
        counts={eventCounts}
        mine={mySignups.get(event.id) ?? null}
        probation={joinContext.probation}
        maxCc={joinContext.maxCc}
        hasEmergencyContact={joinContext.hasEmergencyContact}
        now={now}
      />

      <ChangeLog heading={t("changes.heading")} items={changes.items} />

      <section data-skeleton-result="event-places" aria-labelledby="event-places" className="flex flex-col gap-3">
        <h2 id="event-places" className="text-lg font-semibold">
          {single ? t("detail.meetingPoint") : t("detail.places")}
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          {/* Decoration for a route; a meet-up's one dot would add nothing. */}
          {!single && <RouteStrip places={event.places} className="border-b" />}
          <ol className="divide-y">
            {event.places.map((place, i) => (
              <li key={i}>
                <PlaceActions place={place} label={roleLabel(i)} />
              </li>
            ))}
          </ol>
        </div>
      </section>

      {event.description && (
        <section aria-labelledby="event-description" className="flex flex-col gap-3">
          <h2 id="event-description" className="text-lg font-semibold">
            {t("detail.description")}
          </h2>
          <p className="text-sm wrap-break-word whitespace-pre-wrap">{event.description}</p>
        </section>
      )}

      {requirements.length > 0 && (
        <section aria-labelledby="event-requirements" className="flex flex-col gap-3">
          <h2 id="event-requirements" className="text-lg font-semibold">
            {t("detail.requirements")}
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {requirements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {showRoster && (
        <EventRoster
          rows={roster.rows}
          overCeiling={roster.overCeiling}
          organiser={organiser}
          safety={can(user.access, "members.safety")}
          newMembers={organiser ? 0 : eventCounts.probation}
        />
      )}

      {(event.createdByName || (event.editedByOther && event.updatedByName)) && (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          {event.createdByName && <p>{t("detail.createdBy", { name: event.createdByName })}</p>}
          {event.editedByOther && event.updatedByName && (
            <p>
              {t("detail.updatedBy", {
                name: event.updatedByName,
                date: format.dateTime(new Date(event.updatedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  hourCycle: "h23",
                }),
              })}
            </p>
          )}
        </div>
      )}

      {organiser && (
        <div data-skeleton-result="event-manage" className="flex flex-wrap gap-2 border-t pt-6">
          {!cancelled && <CancelEventDialog eventId={event.id} />}
          <DeleteEventDialog
            eventId={event.id}
            blocked={
              eventCounts.members > 0
                ? t(cancelled ? "detail.deleteHasSignupsCancelled" : "detail.deleteHasSignups")
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Mirrors a typical ride as an organiser sees it before joining: badges, title, date, area and counts lines, the
 * edit/share row, the join panel (heading, Sürücü/Artçı, the guests stepper with its hint, the button and its empty
 * status line), the route card with two places (strip, then name block and the action buttons, which wrap to two rows
 * on a phone), a one-line description, the roster with two rows (each with its safety card button), the
 * "Düzenleyen" line and the cancel/delete row. Members and ön alım members see no edit/share or cancel/delete rows
 * and a roster only in some cases (follow-up: per-viewer shape once the gate opens).
 */
function EventSkeleton() {
  return (
    <div data-skeleton="event" className="flex flex-col gap-6">
      <div data-skeleton="event-header" className="flex flex-col gap-3">
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-4xl" />
          <Skeleton className="h-5 w-28 rounded-4xl" />
        </div>
        <div className="flex h-8 items-center">
          <Skeleton className="h-6 w-2/3" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-64" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div data-skeleton="event-counts" className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-44" />
          </div>
        </div>
      </div>
      <div data-skeleton="event-actions" className="flex gap-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-44" />
      </div>
      <div data-skeleton="event-join" className="flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex h-7 items-center">
          <Skeleton className="h-4.5 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex h-8 items-center justify-between">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-8 w-28" />
          </div>
          {/* The guests hint wraps to two lines on a phone. */}
          <div className="flex h-8 flex-col justify-center gap-1.5 sm:h-4">
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="h-3 w-1/3 sm:hidden" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-28" />
          <div />
        </div>
      </div>
      <div data-skeleton="event-places" className="flex flex-col gap-3">
        <div className="flex h-7 items-center">
          <Skeleton className="h-4.5 w-16" />
        </div>
        <div className="overflow-hidden rounded-xl border">
          <div className="flex h-24 items-center border-b px-4">
            <Skeleton className="h-1 flex-1" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3 border-b p-4 last:border-b-0">
              <div className="flex flex-col gap-0.5">
                <div className="flex h-4 items-center">
                  <Skeleton className="h-2.5 w-16" />
                </div>
                <div className="flex h-6 items-center">
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-30" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-7 w-44" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex h-7 items-center">
          <Skeleton className="h-4.5 w-24" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-full max-w-md" />
        </div>
      </div>
      <div data-skeleton="event-roster" className="flex flex-col gap-3">
        <div className="flex h-7 items-center justify-between">
          <Skeleton className="h-4.5 w-24" />
          <Skeleton className="h-3.5 w-12" />
        </div>
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex h-6 items-center">
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-16" />
                </div>
                <div className="pt-1">
                  <Skeleton className="h-7 w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-48" />
      </div>
      <div data-skeleton="event-manage" className="flex gap-2 border-t pt-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  );
}
