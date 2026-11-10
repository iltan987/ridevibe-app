import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Query = Record<string, string | undefined>;

/** "Next page" / "First page" links for keyset-paginated lists (see lib/pagination). */
export async function Pager({
  pathname,
  query,
  nextCursor,
  onFirstPage,
}: {
  pathname: "/admin/members" | "/admin/applications";
  query: Query;
  nextCursor: string | null;
  onFirstPage: boolean;
}) {
  if (!nextCursor && onFirstPage) return null;
  const t = await getTranslations("Pagination");
  const clean = (q: Query) => Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as Record<string, string>;

  return (
    <nav className="flex items-center justify-between gap-3">
      {onFirstPage ? (
        <span />
      ) : (
        <Link href={{ pathname, query: clean(query) }} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("first")}
        </Link>
      )}
      {nextCursor && (
        <Link
          href={{ pathname, query: clean({ ...query, cursor: nextCursor }) }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("next")} <ChevronRight aria-hidden />
        </Link>
      )}
    </nav>
  );
}
