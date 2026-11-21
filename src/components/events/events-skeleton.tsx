import { PagerSkeleton } from "@/components/pager-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One `EventCard`: the 96px route strip, then the date block beside title, meta line and badge row (one line each). */
function EventCardSkeleton() {
  return (
    <div data-skeleton="events-row" className="overflow-hidden rounded-xl border">
      <div className="flex h-24 flex-col justify-center gap-2 border-b px-4">
        <div className="flex h-4 items-center">
          <Skeleton className="h-1 flex-1" />
        </div>
        <div className="flex h-5 items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      </div>
      <div className="flex gap-4 p-4">
        <Skeleton className="h-15.5 w-12 shrink-0" />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex h-6 items-center">
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-1/2" />
          </div>
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-14 rounded-4xl" />
            <Skeleton className="h-5 w-24 rounded-4xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fallback for the organiser event lists: heading row (title + button), total row (count + link), the filter chips
 * (`chips`: the upcoming list only), three cards and the pager's range line (lists usually fit one page). Mirrors the
 * page layout: sections are `gap-6` apart.
 */
export function EventsSkeleton({ chips = true }: { chips?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {/* The heading's `text-3xl` line is 36px (the button is 32px). */}
      <div data-skeleton="events-heading" className="flex h-9 items-center justify-between gap-3">
        <Skeleton className="h-7.5 w-48" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div data-skeleton="events-total" className="flex h-5 items-center justify-between gap-3">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      {chips && (
        // Same box as the chip row: pills are py-1.5 + border around a text-sm line (h-8.5), the row has pb-1.
        <div data-skeleton="events-chips" className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1">
          {["w-16", "w-24", "w-20", "w-24", "w-18"].map((width, i) => (
            <Skeleton key={i} className={cn("h-8.5 shrink-0 rounded-full", width)} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
      <PagerSkeleton buttons={false} />
    </div>
  );
}
