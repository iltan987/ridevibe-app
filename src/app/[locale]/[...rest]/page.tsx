import { notFound } from "next/navigation";

// Routes unknown paths inside [locale] to the localized not-found page.
export default function CatchAllPage() {
  notFound();
}
