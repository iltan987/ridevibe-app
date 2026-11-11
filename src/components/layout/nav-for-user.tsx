import { RememberApplyHint } from "@/components/apply/remember-apply-hint";
import { getApplyView } from "@/lib/applications/get-apply-view";
import { BottomNav } from "./bottom-nav";
import { DesktopNav } from "./desktop-nav";

// The navs with "Başvur" exactly when /apply would show the form. Read the session, so render them behind <Suspense>
// with the guessing nav (`showApply` undefined) as the fallback.

export async function DesktopNavForUser() {
  const view = await getApplyView();
  return <DesktopNav showApply={view === "form"} />;
}

// The tab bar is in every layout render, so it alone remembers the answer (once per page).
export async function BottomNavForUser() {
  const view = await getApplyView();
  return (
    <>
      <BottomNav showApply={view === "form"} />
      <RememberApplyHint hidden={view !== "form"} />
    </>
  );
}
