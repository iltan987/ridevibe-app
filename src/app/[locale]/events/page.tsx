import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/coming-soon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Nav");
  return { title: t("events") };
}

export default function EventsPage() {
  const t = useTranslations("Nav");
  return <ComingSoon title={t("events")} />;
}
