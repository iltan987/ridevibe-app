import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { BLOOD_TYPES, type BloodType, bloodTypeLabel } from "@/lib/members/blood-type";

/**
 * Safety filters of the directory (members.safety holders only): blood type (GET form that keeps the other
 * params) and the "no emergency contact" toggle chip. Both drop the cursor.
 */
export async function SafetyFilters({
  bloodType,
  noContact,
  query,
  side,
}: {
  bloodType: BloodType | null;
  noContact: boolean;
  query: string;
  side: string | null;
}) {
  const t = await getTranslations("Members.safety");

  return (
    <div role="group" aria-label={t("filtersLabel")} className="flex flex-wrap items-center gap-2">
      <form className="flex items-center gap-2">
        {side && <input type="hidden" name="side" value={side} />}
        {query && <input type="hidden" name="q" value={query} />}
        {noContact && <input type="hidden" name="noContact" value="1" />}
        <NativeSelect name="blood" defaultValue={bloodType ?? ""} aria-label={t("bloodFilter")}>
          <NativeSelectOption value="">{t("bloodFilterAll")}</NativeSelectOption>
          {BLOOD_TYPES.map((type) => (
            <NativeSelectOption key={type} value={type}>
              {bloodTypeLabel(type)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
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
        aria-pressed={noContact}
        className="flex shrink-0 items-center rounded-full border border-input px-3.5 py-1.5 text-sm font-medium text-muted-foreground aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground"
      >
        {t("noContactFilter")}
      </Link>
    </div>
  );
}
