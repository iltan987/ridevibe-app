import { getTranslations } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getMyApplicationStatus } from "@/lib/applications/queries";
import { getCurrentUser } from "@/lib/auth/user";
import { ApplyForm } from "./apply-form";

/**
 * Chooses what /apply shows for the visitor. Reads the session, so it must
 * render behind <Suspense>. Signed-in applicants get their name and sign-in
 * email prefilled; the action links the application to their account.
 */
export async function ApplyGate() {
  const user = await getCurrentUser();
  if (!user) return <ApplyForm />;

  const status = user.profile?.status;
  if (status === "active") return <Notice kind="alreadyMember" />;
  if (status === "inactive") return <Notice kind="inactive" />;
  if (status === "pending") {
    const application = await getMyApplicationStatus().catch((error: unknown) => {
      // Fall back to the form (a duplicate submit is still refused by the DB).
      // The message only carries the error code, no personal data (KVKK).
      unstable_rethrow(error);
      console.error("ApplyGate:", error instanceof Error ? error.message : "getMyApplicationStatus failed");
      return null;
    });
    if (application === "new" || application === "contacted") return <Notice kind="underReview" />;
  }

  return <ApplyForm defaults={{ fullName: user.profile?.full_name ?? "", email: user.email ?? "" }} />;
}

async function Notice({ kind }: { kind: "alreadyMember" | "underReview" | "inactive" }) {
  const t = await getTranslations("Apply");
  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <CardTitle className="text-xl">{t(`${kind}.title`)}</CardTitle>
        <CardDescription>{t(`${kind}.body`)}</CardDescription>
        <Link href="/" className={buttonVariants({ variant: "outline", className: "mt-2" })}>
          {t("backHome")}
        </Link>
      </CardHeader>
    </Card>
  );
}
