import Image from "next/image";
import badge from "@/assets/brand/badge.png";
import { cn } from "@/lib/utils";

// `sizes` must match the badge's rendered CSS width (default 120px, e.g. `size-30`); pass it when sizing differently.
export function ClubBadge({
  className,
  priority,
  alt = "",
  sizes = "120px",
}: {
  className?: string;
  priority?: boolean;
  alt?: string;
  sizes?: string;
}) {
  return (
    <Image
      src={badge}
      alt={alt}
      sizes={sizes}
      priority={priority}
      placeholder="empty"
      className={cn("h-auto w-30", className)}
    />
  );
}
