import { getTranslations } from "next-intl/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClubOverview as ClubOverviewData } from "@/lib/members/queries";

/** What an ön alım member sees instead of the member list: how many people ride with the club, and nobody by name. */
export async function ClubOverview({ overview }: { overview: ClubOverviewData }) {
  const t = await getTranslations("Members");
  const { total, asian, european, initials } = overview;

  return (
    <Card>
      <CardHeader className="items-start gap-3">
        <CardTitle>{t("clubSummary", { total, asian, european })}</CardTitle>
        <CardDescription>{t("clubLocked")}</CardDescription>
        <p className="sr-only">{t("clubInitialsLabel", { total })}</p>
        <ul aria-hidden className="flex flex-wrap gap-2 pt-2">
          {initials.map((letters, i) => (
            <li
              key={i}
              className="flex size-10 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
            >
              {letters}
            </li>
          ))}
        </ul>
      </CardHeader>
    </Card>
  );
}
