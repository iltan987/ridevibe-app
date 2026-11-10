import { CalendarDays, House, Images, UserPlus, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: "/" | "/events" | "/members" | "/gallery" | "/apply";
  labelKey: "home" | "events" | "members" | "gallery" | "apply";
  icon: LucideIcon;
};

// Single source of truth for primary navigation (header on desktop,
// bottom tab bar on mobile).
export const navItems: NavItem[] = [
  { href: "/", labelKey: "home", icon: House },
  { href: "/events", labelKey: "events", icon: CalendarDays },
  { href: "/members", labelKey: "members", icon: Users },
  { href: "/gallery", labelKey: "gallery", icon: Images },
  { href: "/apply", labelKey: "apply", icon: UserPlus },
];

export function isActive(pathname: string, href: NavItem["href"]) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
