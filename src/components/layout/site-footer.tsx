import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="hidden border-t md:block">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-3">
          <Wordmark className="h-5 text-foreground" />
          {t("rights")}
        </span>
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          {t("privacy")}
        </Link>
      </div>
    </footer>
  );
}
