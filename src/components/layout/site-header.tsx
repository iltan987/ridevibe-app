import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DesktopNav } from "./desktop-nav";
import { LocaleSwitcher } from "./locale-switcher";

export function SiteHeader() {
  const t = useTranslations("Metadata");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-4 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {t("title")}
        </Link>
        <DesktopNav />
        <div className="ml-auto">
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
