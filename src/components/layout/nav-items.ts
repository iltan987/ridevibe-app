import { CalendarDays, House, Images, UserPlus, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: "/" | "/events" | "/gallery" | "/apply";
  labelKey: "home" | "events" | "gallery" | "apply";
  icon: LucideIcon;
};

// Single source of truth for primary navigation (header on desktop,
// bottom tab bar on mobile).
export const navItems: NavItem[] = [
  { href: "/", labelKey: "home", icon: House },
  { href: "/events", labelKey: "events", icon: CalendarDays },
  { href: "/gallery", labelKey: "gallery", icon: Images },
  { href: "/apply", labelKey: "apply", icon: UserPlus },
];

export function isActive(pathname: string, href: NavItem["href"]) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
