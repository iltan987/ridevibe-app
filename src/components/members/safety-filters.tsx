"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { listChipClasses } from "@/components/lists/list-chip";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { BloodType } from "@/lib/members/blood-type";
import { BloodSelect } from "./blood-select";

/**
 * Safety filters of the directory (members.safety holders only): blood type (GET form) and the "no emergency
 * contact" toggle chip. Both are server navigations (a blood filter is logged); they keep the search and side the
 * browser has put into the URL since the page loaded (read live, not from the server render) and drop the page.
 */
export function SafetyFilters({ bloodType, noContact }: { bloodType: BloodType | null; noContact: boolean }) {
  const t = useTranslations("Members.safety");
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const side = searchParams.get("side") ?? "";

  return (
    <div role="group" aria-label={t("filtersLabel")} className="flex flex-wrap items-center gap-2">
      <form className="flex items-center gap-2">
        {side && <input type="hidden" name="side" value={side} />}
        {query && <input type="hidden" name="q" value={query} />}
        {noContact && <input type="hidden" name="noContact" value="1" />}
        <BloodSelect initial={bloodType ?? ""} />
        <Button type="submit" variant="outline" size="sm">
          {t("bloodFilterApply")}
        </Button>
      </form>
      <Link
        href={{
          pathname: "/members",
          query: {
            ...(side ? { side } : {}),
            ...(query ? { q: query } : {}),
            ...(bloodType ? { blood: bloodType } : {}),
            ...(noContact ? {} : { noContact: "1" }),
          },
        }}
        aria-current={noContact ? "page" : undefined}
        // The href follows the live search: a prefetch would hit the server on every keystroke.
        prefetch={false}
        className={listChipClasses.current}
      >
        {t("noContactFilter")}
      </Link>
    </div>
  );
}
