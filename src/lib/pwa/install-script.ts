// Early capture of the browser's install events. Dependency-free (no `@/` imports) so `node --test` can load it and the
// server layout can embed it as an inline script in <head>.
//
// `beforeinstallprompt` can fire before React hydrates, and it fires only once per page load, so a listener added by a
// component would miss it. This script stashes the event on `window` and announces changes; the install store reads it.

export const INSTALL_DISMISSED_KEY = "rv-install-dismissed";
export const INSTALL_INSTALLED_KEY = "rv-install-installed";
export const INSTALL_CHANGE_EVENT = "rv-install-change";
export const INSTALL_PROMPT_PROP = "__rvInstallPrompt";

/**
 * Stringified with `toString()`, so it must be fully self-contained (arguments only; the vm test enforces this).
 * The `win` parameter is loosely typed on purpose: it carries a dynamic property and a guard flag.
 */
function captureInstall(
  win: Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  promptProp: string,
  installedKey: string,
  changeEvent: string,
): void {
  if (win.__rvInstallCaptured) return;
  win.__rvInstallCaptured = true;
  win.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    win[promptProp] = e;
    // Chrome offers install only when the app isn't installed in this browser: it was uninstalled, forget the flag.
    try {
      win.localStorage.removeItem(installedKey);
    } catch {
      // storage unavailable
    }
    win.dispatchEvent(new win.Event(changeEvent));
  });
  win.addEventListener("appinstalled", () => {
    win[promptProp] = null;
    try {
      win.localStorage.setItem(installedKey, "1");
    } catch {
      // storage unavailable: the in-memory state is still cleared
    }
    win.dispatchEvent(new win.Event(changeEvent));
  });
}

export const installCaptureScript = `(${captureInstall.toString()})(window, ${JSON.stringify(INSTALL_PROMPT_PROP)}, ${JSON.stringify(INSTALL_INSTALLED_KEY)}, ${JSON.stringify(INSTALL_CHANGE_EVENT)})`;
