"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { ProfileActionResult } from "@/lib/members/actions";

/** Runs a profile server action in a transition and keeps its result for the form to show. */
export function useProfileAction() {
  const t = useTranslations("Profile.errors");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ProfileActionResult | null>(null);

  function run(action: () => Promise<ProfileActionResult>, onOk?: () => void) {
    setResult(null);
    startTransition(async () => {
      const next = await action().catch((): ProfileActionResult => ({ status: "error" }));
      setResult(next);
      if (next.status === "ok") onOk?.();
    });
  }

  /** Translated message for one field (only after an "invalid" result). */
  function fieldError(field: string) {
    const key = result?.status === "invalid" ? result.fieldErrors?.[field] : undefined;
    return key ? t(key) : undefined;
  }

  return { isPending, result, setResult, run, fieldError };
}

/**
 * Polite live region: "saved" after a successful save, otherwise the error
 * (field errors show under their inputs, so a form-level hint is enough here).
 */
export function ActionStatus({ result, showSaved = true }: { result: ProfileActionResult | null; showSaved?: boolean }) {
  const t = useTranslations("Profile");
  let text: string | null = null;
  let isError = false;
  if (result?.status === "ok") text = showSaved ? t("saved") : null;
  else if (result) {
    text = t(`errors.${result.status}`);
    isError = true;
  }
  return (
    <p aria-live="polite" className={isError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {text}
    </p>
  );
}
