import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="hidden border-t md:block">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted-foreground">
        {t("rights")}
      </div>
    </footer>
  );
}
