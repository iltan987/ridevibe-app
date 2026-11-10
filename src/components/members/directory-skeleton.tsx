import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for the member directory: total + profile link row, search row, the three side chips and 4 cards.
 * Mirrors the page layout (sections `gap-6` apart); card height is a typical card (name, location, one bike = 94px; measured).
 */
export function DirectorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-5 items-center justify-between gap-3" data-skeleton="members-total">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <div className="flex gap-2" data-skeleton="members-search">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="size-8" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1" data-skeleton="members-chips">
        {["w-16", "w-24", "w-24"].map((width, i) => (
          <Skeleton key={i} className={`h-8.5 shrink-0 rounded-full ${width}`} />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} data-skeleton="members-row" className="h-23.5 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
