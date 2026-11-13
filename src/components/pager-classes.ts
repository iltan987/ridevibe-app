import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shared by PagerLinks (server) and PagerButtons (client); lives apart from pager.tsx so the client bundle
// doesn't import the server-only translation helper.
export const pagerClasses = {
  wrapper: "flex flex-col items-center gap-2",
  row: "flex items-center justify-center gap-1",
  arrow: cn(buttonVariants({ variant: "outline", size: "icon" }), "size-9"),
  disabled: "pointer-events-none opacity-40",
  number: cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-9 tabular-nums"),
  current: "bg-primary text-primary-foreground font-bold hover:bg-primary",
  gap: "flex size-9 items-center justify-center text-muted-foreground",
  range: "text-xs text-muted-foreground tabular-nums",
} as const;
