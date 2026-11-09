import type { Metadata, Viewport } from "next";
import { Saira } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { locale } from "next/root-params";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ThemeScript } from "@/components/theme/theme-script";
import { routing } from "@/i18n/routing";
import { THEME_COLORS } from "@/lib/theme";
import "../globals.css";

// Saira is a variable font (weight + width axes) with Turkish characters (ğ, ş, ı, İ) in latin-ext.
const saira = Saira({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return {
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
  };
}

export const viewport: Viewport = {
  themeColor: THEME_COLORS.dark, // the theme script/switcher update the meta for other themes
};

export default async function LocaleLayout({
  children,
}: LayoutProps<"/[locale]">) {
  return (
    <html
      lang={await locale()}
      className={`${saira.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <SiteHeader />
          {/* Bottom padding keeps content clear of the mobile tab bar. */}
          <main className="flex flex-1 flex-col pb-20 md:pb-0">{children}</main>
          <SiteFooter />
          <BottomNav />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
