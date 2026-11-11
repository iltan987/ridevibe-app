import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { type ApplyView } from "@/lib/applications/apply-view";
import { getApplyView } from "@/lib/applications/get-apply-view";
import { getCurrentUser } from "@/lib/auth/user";
import { ApplyForm } from "./apply-form";

/**
 * Chooses what /apply shows for the visitor. Reads the session, so it must
 * render behind <Suspense>. Signed-in applicants get their name and sign-in
 * email prefilled; the action links the application to their account.
 */
export async function ApplyGate() {
  const view = await getApplyView();
  if (view !== "form") return <Notice kind={view} />;

  const user = await getCurrentUser(); // cached by getApplyView: no extra query
  if (!user) return <ApplyForm />;
  return <ApplyForm defaults={{ fullName: user.profile?.full_name ?? "", email: user.email ?? "" }} />;
}

async function Notice({ kind }: { kind: Exclude<ApplyView, "form"> }) {
  const t = await getTranslations("Apply");
  return (
    <Card data-skeleton-result="apply">
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
