import { getTranslations } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getMyApplicationStatus } from "@/lib/applications/queries";

/** Pending members: tell them whether they still need to apply. */
export async function PendingCard() {
  const [application, t] = await Promise.all([
    // On failure show the generic pending card. The message only carries the
    // error code, no personal data (KVKK).
    getMyApplicationStatus().catch((error: unknown) => {
      unstable_rethrow(error);
      console.error("PendingCard:", error instanceof Error ? error.message : "getMyApplicationStatus failed");
      return "failed" as const;
    }),
    getTranslations("Account"),
  ]);
  const kind =
    application === "failed"
      ? "pending"
      : application === null
        ? "notApplied"
        : application === "new" || application === "contacted"
          ? "underReview"
          : "pending";

  return (
    <Card className="border-sun/40 bg-sun/10">
      <CardHeader className="items-start gap-3">
        <CardTitle>{t(`${kind}Title`)}</CardTitle>
        <CardDescription>{t(`${kind}Body`)}</CardDescription>
        {kind === "notApplied" && (
          <Link href="/apply" className={buttonVariants({ className: "mt-2" })}>
            {t("applyNow")}
          </Link>
        )}
      </CardHeader>
    </Card>
  );
}
