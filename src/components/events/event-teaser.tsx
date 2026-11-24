import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ApplyLink } from "@/components/apply/apply-link";
import { TeaserCard } from "@/components/events/teaser-card";
import { buttonVariants } from "@/components/ui/button";
import { getPathname, Link } from "@/i18n/navigation";
import { getApplyView } from "@/lib/applications/get-apply-view";
import { getEventPreview } from "@/lib/events/public";

/**
 * `/events/[id]` for everyone outside the events gate (events release spec §5.4): the event's public card, then
 * signed out: "Giriş yap" (back to this event) and "Başvur"; signed in: what `/apply` offers them ("Başvur", "under
 * review" or nothing: inactive, `deleting`). Unknown id: 404. Reads the session when `signedIn`: render behind
 * <Suspense>.
 */
export async function EventTeaser({ id, signedIn }: { id: string; signedIn: boolean }) {
  const [preview, view, locale, t, tApply] = await Promise.all([
    getEventPreview(id),
    signedIn ? getApplyView() : null,
    getLocale(),
    getTranslations("Events.teaser"),
    getTranslations("Apply"),
  ]);
  if (!preview) notFound();

  const next = getPathname({ href: `/events/${id}`, locale });
  const apply = (
    <ApplyLink className={buttonVariants({ variant: signedIn ? "default" : "outline" })}>{t("apply")}</ApplyLink>
  );

  return (
    <div data-skeleton-result="event-teaser" className="flex flex-col gap-4">
      <TeaserCard
        title={preview.title}
        day={preview.day}
        kind={preview.kind}
        area={preview.area}
        cancelled={preview.cancelled}
        headingLevel="h1"
      />
      {!signedIn && (
        <div className="flex flex-wrap gap-2">
          {/* Most people holding a shared link are members: signing in comes first. */}
          <Link href={{ pathname: "/sign-in", query: { next } }} className={buttonVariants()}>
            {t("signIn")}
          </Link>
          {apply}
        </div>
      )}
      {view === "form" && <div className="flex flex-wrap gap-2">{apply}</div>}
      {view === "underReview" && <p className="text-sm text-muted-foreground">{tApply("underReview.title")}</p>}
    </div>
  );
}
