import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for `PagerButtons` / `PagerLinks`: the button row of a typical multi-page list (‹ 1 2 … 6 ›, 36px
 * buttons) + the range line. `buttons={false}` reserves the range line only, for lists that usually fit one page
 * (the button row is hidden then). Measured against both (`scripts/e2e/skeletons.mjs`).
 */
export function PagerSkeleton({ buttons = true }: { buttons?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2" data-skeleton="pager">
      {buttons && (
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="size-9" />
          ))}
        </div>
      )}
      <div className="flex h-4 items-center">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
