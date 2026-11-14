import Image, { type StaticImageData } from "next/image";
import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

// The page's route line. It lives in the left gutter of the usual max-width container; the geometry is exposed as
// two custom properties so stops and full-bleed photos can align to it: `--route-x` (line's left edge) and
// `--route-pad` (where the content starts). Turquoise: the bright token in dark, the darker one on cream (contrast).
const LINE = "bg-status-foreground dark:bg-status";

export function Route({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-5xl pr-5 pl-(--route-pad) [--route-pad:58px] [--route-x:27px] md:pr-8 md:[--route-pad:88px] md:[--route-x:40px]">
      <span aria-hidden className={cn("absolute inset-y-0 left-(--route-x) w-[3px]", LINE)} />
      {children}
    </div>
  );
}

const RING =
  "before:top-(--dot-top,0.75rem) before:left-[calc(var(--route-x)-var(--route-pad)-6px)] before:size-[15px] before:border-[3px] before:border-status-foreground before:bg-background dark:before:border-status";

const DOT = {
  section: RING,
  step: RING,
  place:
    "before:top-[0.5em] before:left-[calc(var(--route-x)-var(--route-pad)-4px)] before:size-[11px] before:bg-status-foreground dark:before:bg-status",
  last: "before:top-(--dot-top,0.75rem) before:left-[calc(var(--route-x)-var(--route-pad)-8px)] before:size-[19px] before:bg-primary",
} as const;

// Content with its dot on the line. On two-column rows put the stop on the row wrapper and override `--dot-top`.
export function RouteStop({
  kind = "section",
  as = "div",
  className,
  children,
}: {
  kind?: keyof typeof DOT;
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
}) {
  const Tag: ElementType = as;
  return (
    <Tag
      className={cn(
        "relative before:absolute before:rounded-full before:content-['']",
        DOT[kind],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

// Phone: full-bleed photo with the line drawn over it. md+: an ordinary column image.
export function RoutePhoto({
  src,
  alt,
  className,
  sizes,
}: {
  src: StaticImageData;
  alt: string;
  className?: string;
  sizes: string;
}) {
  return (
    <div
      className={cn(
        "relative -mr-5 -ml-(--route-pad) before:absolute before:inset-y-0 before:left-(--route-x) before:z-10 before:w-[3px] before:content-[''] md:mr-0 md:ml-0 md:before:hidden",
        "before:bg-status-foreground dark:before:bg-status",
      )}
    >
      <Image
        src={src}
        alt={alt}
        sizes={sizes}
        placeholder="blur"
        className={cn("h-75 w-full object-cover md:h-130 md:rounded-sm", className)}
      />
    </div>
  );
}
