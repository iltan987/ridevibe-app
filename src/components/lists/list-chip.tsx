import type { ReactNode } from "react";

const base =
  "flex shrink-0 items-center gap-1.5 rounded-full border border-input px-3.5 py-1.5 text-sm font-medium text-muted-foreground";

/**
 * Filter chip look of the lists: `pressed` for toggle buttons (`aria-pressed`), `current` for links to the chosen
 * filter (`aria-current="page"`, server navigations).
 */
export const listChipClasses = {
  pressed: `${base} aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground`,
  current: `${base} aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground`,
} as const;

/** The count after a chip's label. */
export function ChipCount({ count }: { count: number }) {
  return <span className="tabular-nums opacity-70">{count}</span>;
}

/** A filter chip of a list filtered in the browser: a toggle button with its label and count. */
export function ListChip({
  pressed,
  count,
  onClick,
  children,
}: {
  pressed: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={listChipClasses.pressed}>
      {children}
      <ChipCount count={count} />
    </button>
  );
}
