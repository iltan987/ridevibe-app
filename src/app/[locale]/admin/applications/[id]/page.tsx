import { Mail, MessageCircle, Phone } from "lucide-react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApplicationContactEditor } from "@/components/admin/application-contact-editor";
import { ApplicationReviewPanel } from "@/components/admin/application-review-panel";
import { getPathname, Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { can } from "@/lib/auth/permissions";
import { getApplication, getApplicationAccount } from "@/lib/applications/queries";
import { requirePermission } from "@/lib/auth/require-access";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("applications"), robots: { index: false } };
}

export default async function ApplicationDetailPage({ params }: PageProps<"/[locale]/admin/applications/[id]">) {
  const t = await getTranslations("Admin");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Link href="/admin/applications" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t("back")}
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <ApplicationDetail params={params} />
      </Suspense>
    </section>
  );
}

/**
 * Mirrors a new, unlinked application as seen by a reviewer: header (name, date, contact buttons), the review card
 * and the first two section cards. Sizes are the real ones (text-2xl line = h-8, sm button = h-7, button = h-8).
 */
function DetailSkeleton() {
  return (
    <div data-skeleton="detail" className="flex flex-col gap-6">
      <div data-skeleton="detail-header" className="flex flex-col gap-3">
        <div className="flex h-8 items-center">
          <Skeleton className="h-6 w-44" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-26" />
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-7 w-22" />
        </div>
      </div>

      <Card data-skeleton="detail-review">
        <CardHeader>
          <div className="flex h-5.5 items-center">
            <Skeleton className="h-4 w-32" />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-31" />
            <Skeleton className="h-8 w-17" />
            <Skeleton className="h-8 w-17" />
          </div>
          <Skeleton className="h-21.5 w-full rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10.5 w-full sm:h-5.25" />
            <Skeleton className="h-8 w-26" />
          </div>
          <Skeleton className="h-8 w-33" />
        </CardContent>
      </Card>

      <SectionSkeleton name="detail-section" top rows={3} />
      <SectionSkeleton rows={5} />
    </div>
  );
}

/** A section card: title line, optional contact block (two rows + edit button), then label/value rows. */
function SectionSkeleton({ name, top = false, rows }: { name?: string; top?: boolean; rows: number }) {
  return (
    <Card data-skeleton={name}>
      <CardHeader>
        <div className="flex h-5.5 items-center">
          <Skeleton className="h-4 w-28" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {top && (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-3">
              <SkeletonRow width="w-28" />
              <SkeletonRow width="w-32" />
            </div>
            <Skeleton className="h-7 w-22" />
          </div>
        )}
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }, (_, i) => (
            <SkeletonRow key={i} width="w-full max-w-64" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Same box as `Row`: label (text-xs, h-4) + value (text-sm, h-5), gap-0.5. */
function SkeletonRow({ width }: { width: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-4 items-center">
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div className="flex h-5 items-center">
        <Skeleton className={`h-3.5 ${width}`} />
      </div>
    </div>
  );
}

// Age in full years on today's date in Istanbul.
function ageFrom(birthDate: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const [ty, tm, td] = today.split("-").map(Number);
  const [by, bm, bd] = birthDate.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

async function ApplicationDetail({ params }: { params: PageProps<"/[locale]/admin/applications/[id]">["params"] }) {
  const { id } = await params;
  const me = await requirePermission("applications.view", `/admin/applications/${id}`);

  const [a, account, t, tApply, format] = await Promise.all([
    getApplication(id),
    getApplicationAccount(id),
    getTranslations("Admin"),
    getTranslations("Apply"),
    getFormatter(),
  ]);
  if (!a) notFound();

  const list = (values: string[], key: "languages" | "riding_styles" | "event_interests") =>
    values.map((v) => tApply(`options.${key}.${v}` as Parameters<typeof tApply>[0])).join(", ");
  const yesNo = (v: boolean) => tApply(v ? "options.yes" : "options.no");
  const waNumber = a.phone.replace(/\D/g, "");

  const decidedLabel = a.reviewed_at
    ? a.reviewer?.full_name
      ? t("review.decidedBy", { name: a.reviewer.full_name, date: format.dateTime(new Date(a.reviewed_at), { dateStyle: "medium", timeStyle: "short" }) })
      : t("review.decidedByUnknown", { date: format.dateTime(new Date(a.reviewed_at), { dateStyle: "medium", timeStyle: "short" }) })
    : null;
  // Linked = profile_id. The account details come from an RPC: profiles RLS
  // hides pending accounts from staff without members.manage.
  const linked = !!a.profile_id;
  const inviteHref = a.status === "approved" && !linked ? await whatsAppInvite(a) : null;
  const canReview = can(me.access, "applications.review");
  const canDecide = can(me.access, "applications.decide");

  const contactRows = (
    <>
      <Row label={tApply("fields.phone")}>{a.phone}</Row>
      <Row label={tApply("fields.email")}>{a.email}</Row>
    </>
  );

  return (
    <div data-skeleton-result="detail" className="flex flex-col gap-6">
      <header data-skeleton-result="detail-header" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{a.full_name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("submittedAt")}: {format.dateTime(new Date(a.created_at), { dateStyle: "long", timeStyle: "short" })}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm" })}>
            <MessageCircle aria-hidden /> {t("contact.whatsapp")}
          </a>
          <a href={`tel:${a.phone}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <Phone aria-hidden /> {t("contact.call")}
          </a>
          <a href={`mailto:${a.email}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
            <Mail aria-hidden /> {t("contact.email")}
          </a>
        </div>
      </header>

      <ApplicationReviewPanel
        application={{ id: a.id, status: a.status, name: a.full_name, email: a.email, notes: a.admin_notes }}
        canReview={canReview}
        canDecide={canDecide}
        canDelete={can(me.access, "applications.delete")}
        decidedLabel={decidedLabel}
        linked={linked}
        account={account}
        inviteHref={inviteHref}
        canLink={canDecide && !linked && a.status !== "rejected"}
      />

      <Section
        title={tApply("sections.about")}
        top={
          // decide includes review (RLS)
          canReview || canDecide ? (
            <ApplicationContactEditor
              application={{ id: a.id, full_name: a.full_name, phone: a.phone, email: a.email }}
              emailLocked={a.status === "approved" && !canDecide}
            >
              {contactRows}
            </ApplicationContactEditor>
          ) : (
            <dl className="flex flex-col gap-3">{contactRows}</dl>
          )
        }
      >
        <Row label={tApply("fields.birth_date")}>
          {format.dateTime(new Date(`${a.birth_date}T12:00:00`), { dateStyle: "long" })} · {t("age", { age: ageFrom(a.birth_date) })}
        </Row>
        <Row label={tApply("fields.city")}>
          {a.city} / {a.district}
          {a.side && ` · ${t(`sides.${a.side}`)}`}
        </Row>
        {a.instagram && (
          <Row label={tApply("fields.instagram")}>
            <a href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              @{a.instagram}
            </a>
          </Row>
        )}
        <Row label={tApply("fields.languages")}>
          {list(a.languages, "languages")}
          {a.other_languages && ` (${a.other_languages})`}
        </Row>
      </Section>

      <Section title={tApply("sections.riding")}>
        <Row label={tApply("fields.license_class")}>{tApply(`options.license_class.${a.license_class}`)}</Row>
        <Row label={tApply("fields.riding_years")}>{t("years", { years: a.riding_years })}</Row>
        <Row label={tApply("fields.owns_motorcycle")}>
          {a.owns_motorcycle
            ? [a.motorcycle_brand, a.motorcycle_model, a.motorcycle_cc && `${a.motorcycle_cc} cc`].filter(Boolean).join(" · ")
            : yesNo(false)}
        </Row>
        <Row label={tApply("fields.riding_styles")}>{list(a.riding_styles, "riding_styles")}</Row>
        <Row label={tApply("fields.group_experience")}>{tApply(`options.group_experience.${a.group_experience}`)}</Row>
      </Section>

      <Section title={tApply("sections.club")}>
        <Row label={tApply("fields.in_other_clubs")}>
          {a.in_other_clubs ? a.other_club_names : yesNo(false)}
        </Row>
        <Row label={tApply("fields.heard_from")}>
          {tApply(`options.heard_from.${a.heard_from}`)}
          {a.referrer_name && ` · ${a.referrer_name}`}
        </Row>
        {(a.utm_source || a.utm_campaign) && (
          <Row label={t("source")}>
            {[a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content].filter(Boolean).join(" / ")}
          </Row>
        )}
        <Row label={tApply("fields.event_interests")}>
          {list(a.event_interests, "event_interests")}
          {a.other_event_interests && ` (${a.other_event_interests})`}
        </Row>
        <Row label={tApply("fields.expectations")} block>{a.expectations}</Row>
        <Row label={tApply("fields.alienating_behaviors")} block>{a.alienating_behaviors}</Row>
        {/* Asked since 2026-11-10; older applications have no answer. */}
        {a.conflict_handling && (
          <Row label={tApply("fields.conflict_handling")} block>{a.conflict_handling}</Row>
        )}
      </Section>

      <Section title={t("consents")}>
        <p className="text-sm">{a.consent_photos ? t("consentPhotosYes") : t("consentPhotosNo")}</p>
        <p className="text-xs text-muted-foreground">{t("noticeVersion", { version: a.privacy_notice_version })}</p>
      </Section>
    </div>
  );
}

/** wa.me link with the approval invite, written in the applicant's language. */
async function whatsAppInvite(a: { full_name: string; email: string; phone: string; locale: string }) {
  const locale = hasLocale(routing.locales, a.locale) ? a.locale : routing.defaultLocale;
  const [t, h] = await Promise.all([getTranslations({ locale, namespace: "Admin.invite" }), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}${getPathname({ href: "/sign-in", locale })}`;
  const text = t("message", { name: a.full_name.split(" ")[0], email: a.email, url });
  return `https://wa.me/${a.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** `top`: content above the rows that brings its own markup (e.g. the contact editor). */
function Section({ title, top, children }: { title: string; top?: ReactNode; children: ReactNode }) {
  return (
    <Card data-skeleton-result="detail-section">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {top}
        <dl className="flex flex-col gap-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Row({ label, children, block }: { label: string; children: ReactNode; block?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={block ? "text-sm whitespace-pre-wrap" : "text-sm"}>{children}</dd>
    </div>
  );
}
