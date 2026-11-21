import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Heights follow the form's own boxes (measured with JS off vs on, 390 and 1280 px): a field label is 19px, a radio
// group title 20px, a hint line 21px, an input 40px (36px from `md`); hints that wrap on a phone get taller boxes there.

/** One text line of `box` height with a bar of `bar` width. */
function Line({ box, bar }: { box: string; bar: string }) {
  return (
    <div className={cn("flex items-center", box)}>
      <Skeleton className={cn("h-3.5", bar)} />
    </div>
  );
}

/** Label, input and an optional hint (`hint` = its box height classes). */
function InputSkeleton({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Line box="h-4.75" bar={label} />
      <Skeleton className="h-10 w-full md:h-9" />
      {hint && <Line box={hint} bar="w-full" />}
    </div>
  );
}

/** A radio group: title and a row of 40px chips (`rows` wraps them on a phone). */
function ChipsSkeleton({ title, chips }: { title: string; chips: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Line box="h-5" bar={title} />
      <div className="flex flex-wrap gap-2">
        {chips.map((width) => (
          <Skeleton key={width} className={cn("h-10", width)} />
        ))}
      </div>
    </div>
  );
}

/** A checkbox with its label and one-line hint. */
function CheckboxSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-10.5 gap-2">
      <Skeleton className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-1 flex-col gap-0.5">
        <Line box="h-4.75" bar={label} />
        <Line box="h-5.25" bar="w-48" />
      </div>
    </div>
  );
}

/**
 * A place card: role, name, paste box with its three-line (phone) hint; `pin`: the filled pin row of a saved place
 * (its coordinates wrap to two lines on a phone).
 */
function PlaceSkeleton({ pin }: { pin: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <Line box="h-7" bar="w-20" />
      <InputSkeleton label="w-16" />
      <InputSkeleton label="w-56" hint="h-15.75 sm:h-10.5 md:h-5.25" />
      {pin && <Skeleton className="h-12 w-full sm:h-9" />}
    </div>
  );
}

/**
 * Fallback of the create and edit pages: mirrors the create form (a ride: type, title, side, dates, area, start,
 * "Durak ekle", the loop box, finish, description, requirements, the save button with its "add a location" hint).
 * `edit`: a saved ride instead: the "Etkinliğe dön" link (inside the boundary there), a pin row in each place and no
 * hint under the save button.
 */
export function EventFormSkeleton({ edit = false }: { edit?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {edit && <Line box="h-5" bar="w-28" />}
      <div data-skeleton="event-form-heading" className="flex h-9 items-center">
        <Skeleton className="h-7.5 w-56" />
      </div>
      <div data-skeleton="event-form" className="flex flex-col gap-8">
        <div data-skeleton="event-form-fields" className="flex flex-col gap-5">
          <ChipsSkeleton title="w-8" chips={["w-27.25", "w-22.5"]} />
          <InputSkeleton label="w-12" />
          <ChipsSkeleton title="w-10" chips={["w-37.75", "w-36", "w-42.75"]} />
          <div className="grid gap-5 sm:grid-cols-2 sm:items-start">
            <InputSkeleton label="w-24" />
            <InputSkeleton label="w-28" hint="h-10.5" />
          </div>
          <InputSkeleton label="w-12" hint="h-10.5 sm:h-5.25" />
        </div>

        <div data-skeleton="event-form-places" className="flex flex-col gap-3">
          {/* A fieldset's legend is no flex item: 24px plus its 6px margin, no gap. */}
          <Line box="-mb-1.5 h-6" bar="h-4.5 w-12" />
          <PlaceSkeleton pin={edit} />
          <Skeleton className="h-8 w-27.75" />
          <CheckboxSkeleton label="w-28" />
          <PlaceSkeleton pin={edit} />
        </div>

        <div data-skeleton="event-form-description" className="flex flex-col gap-2">
          <Line box="h-4.75" bar="w-32" />
          <Skeleton className="h-16 w-full" />
          <Line box="h-5.25" bar="w-56" />
        </div>

        <div data-skeleton="event-form-requirements" className="flex flex-col gap-4">
          <div className="flex h-10.75 flex-col">
            <Line box="h-5.5" bar="h-4.5 w-36" />
            <Line box="h-5.25" bar="w-52" />
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <InputSkeleton label="w-20" />
            <InputSkeleton label="w-20" />
            <InputSkeleton label="w-14" />
          </div>
          <CheckboxSkeleton label="w-32" />
        </div>

        <div data-skeleton="event-form-save" className="flex flex-col gap-3">
          <Skeleton className={cn("h-11 w-full", edit ? "sm:w-18.5" : "sm:w-17.5")} />
          {!edit && <Line box="h-10 sm:h-5" bar="w-full" />}
        </div>
      </div>
    </div>
  );
}
