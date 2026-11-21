import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EventForm } from "@/components/events/event-form";
import { EventFormSkeleton } from "@/components/events/event-form-skeleton";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/lib/auth/require-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Events");
  return { title: t("create"), robots: { index: false } };
}

// Organisers only (`events.manage`); everyone else gets a 404 (release gate, spec §9), so the heading and the form sit
// inside the boundary with the permission check.
export default async function NewEventPage() {
  const t = await getTranslations("Events");
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/events" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("backToList")}
      </Link>
      <Suspense fallback={<EventFormSkeleton />}>
        <NewEvent />
      </Suspense>
    </section>
  );
}

async function NewEvent() {
  await requirePermission("events.manage", "/events/new");
  const t = await getTranslations("Events");
  return (
    <div className="flex flex-col gap-6">
      <h1 data-skeleton-result="event-form-heading" className="heading text-3xl">
        {t("create")}
      </h1>
      <EventForm event={null} />
    </div>
  );
}
