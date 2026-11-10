import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Fallback for the admin lists (applications, members): the filter chip row, an optional search row and `rows`
 * skeleton rows. Mirrors the page layout: sections are `gap-6` apart, rows have their own gap.
 *
 * - `rowClassName`: the row's height class (and breakpoints), measured on the real row.
 * - `listClassName`: gap between rows, same as the real `<ul>`.
 * - `search`: the members search form (input + icon button, `h-8`).
 * - `hint`: the members pending-tab helper paragraph (`text-sm`, h-5 lines: four on phones, two from `sm`).
 */
export function ListSkeleton({
  rows,
  rowClassName,
  listClassName = "gap-3",
  search = false,
  hint = false,
}: {
  rows: number;
  rowClassName: string;
  listClassName?: string;
  search?: boolean;
  hint?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Same box as the filter chip nav: pills are py-1.5 + border around a text-sm line (h-8.5), nav has pb-1. */}
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1" data-skeleton="admin-chips">
        {["w-20", "w-16", "w-24", "w-20"].map((width, i) => (
          <Skeleton key={i} className={cn("h-8.5 shrink-0 rounded-full", width)} />
        ))}
      </div>
      {search && (
        <div className="flex gap-2" data-skeleton="admin-search">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="size-8" />
        </div>
      )}
      {hint && (
        <div className="flex flex-col">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn("flex h-5 items-center", i > 1 && "sm:hidden")}>
              <Skeleton className={cn("h-3.5", i === 3 ? "w-1/2" : "w-full")} />
            </div>
          ))}
        </div>
      )}
      <div className={cn("flex flex-col", listClassName)}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} data-skeleton="admin-row" className={cn("w-full rounded-xl", rowClassName)} />
        ))}
      </div>
    </div>
  );
}
