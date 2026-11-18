import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Top of /account for ön alım members: where they are in the process. */
export async function ProbationCard() {
  const t = await getTranslations("Account");

  return (
    <Card className="border-sun/40 bg-sun/10">
      <CardHeader className="items-start gap-3">
        <CardTitle>{t("probationTitle")}</CardTitle>
        <CardDescription>{t("probationBody")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
