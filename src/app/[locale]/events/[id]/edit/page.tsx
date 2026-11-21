import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EventForm } from "@/components/events/event-form";
import { EventFormSkeleton } from "@/components/events/event-form-skeleton";
import { Link, redirect } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-access";
import { getEvent } from "@/lib/events/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Events.form");
  return { title: t("editTitle"), robots: { index: false } };
}

// Organisers only, like the event page: the whole content (the back link names the event's id) sits inside the
// boundary. A cancelled event can't be edited: back to its page.
export default function EditEventPage({ params }: PageProps<"/[locale]/events/[id]/edit">) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<EventFormSkeleton edit />}>
        <EditEvent params={params} />
      </Suspense>
    </section>
  );
}

async function EditEvent({ params }: { params: PageProps<"/[locale]/events/[id]/edit">["params"] }) {
  const { id } = await params;
  await requirePermission("events.manage", `/events/${id}/edit`);
  const [event, t, locale] = await Promise.all([getEvent(id), getTranslations("Events"), getLocale()]);
  if (!event) notFound();
  if (event.status === "cancelled") redirect({ href: `/events/${event.id}`, locale });

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("form.backToEvent")}
      </Link>
      <h1 data-skeleton-result="event-form-heading" className="heading text-3xl">
        {t("form.editTitle")}
      </h1>
      {/* Only what the form edits goes to the browser. */}
      <EventForm
        event={{
          id: event.id,
          kind: event.kind,
          title: event.title,
          side: event.side,
          area: event.area,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          description: event.description,
          limitPeople: event.limitPeople,
          limitBikes: event.limitBikes,
          minCc: event.minCc,
          fullMembersOnly: event.fullMembersOnly,
          places: event.places,
        }}
      />
    </div>
  );
}
