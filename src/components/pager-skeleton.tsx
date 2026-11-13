import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for `PagerButtons` / `PagerLinks` of a typical list (~6 pages: ‹ 1 2 … 6 ›, 36px buttons) + the range line.
 * Estimated from `pagerClasses`, not measured yet.
 */
export function PagerSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2" data-skeleton="pager">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="size-9" />
        ))}
      </div>
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
