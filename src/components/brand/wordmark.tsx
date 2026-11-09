import { cn } from "@/lib/utils";

const MASK = "url(/brand/wordmark.svg) center / contain no-repeat";

// forced-color-adjust-none: Windows High Contrast would otherwise drop the background and hide the mask.
// Brush-lettering wordmark, painted with currentColor through a CSS mask (one cached SVG, works in both themes).
// The artwork is 1794:572 (~3.14:1): give a height (`h-8`) and the width follows from the aspect ratio.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Ride & Vibe"
      className={cn("inline-block aspect-[1794/572] bg-current forced-color-adjust-none", className)}
      style={{ mask: MASK, WebkitMask: MASK }}
    />
  );
}
