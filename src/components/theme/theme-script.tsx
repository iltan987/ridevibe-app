import { InlineScript } from "@/components/inline-script";
import { themeInitScript } from "@/lib/theme";

// Runs synchronously while <head> is parsed, so the stored theme is applied before first paint
// (the server always renders the dark default; see docs/learnings/ui.md).
export function ThemeScript() {
  return <InlineScript html={themeInitScript} />;
}
