// Cross-tab sync: one `localStorage` key per topic (who is signed in, the chosen language). A tab publishes what it
// knows; the other tabs hear it through the `storage` event (fires only in the *other* tabs, also hidden ones). A tab
// the browser froze in the background gets no events, so the value is compared again when the tab becomes visible or
// comes back from the back/forward cache. A missing key counts as "". Writing the value that is already stored fires
// no event, so tabs that publish what they were told can't bounce changes back and forth.
// Dependency-free (no `@/` imports, no "use client") so `node --test` can load it; nothing touches `window` at module
// load.

export const AUTH_SYNC_KEY = "rv-auth";
export const LOCALE_SYNC_KEY = "rv-locale";

// Pages whose form input a language switch would wipe (it remounts the [locale] layout): `/apply` step 4 is not in
// the draft, `/account` edits are unsaved. These keep their language when another tab switches (iltan's choice,
// 2026-11-12). Paths without the locale prefix (next-intl's `usePathname`).
const KEEPS_LOCALE = new Set(["/apply", "/account"]);

export function followsLocaleChange(pathname: string): boolean {
  return !KEEPS_LOCALE.has(pathname);
}

export type TabChannel = {
  /** Store this tab's value; other tabs whose last known value differs are notified. */
  publish(value: string): void;
  /** Called with the new value when another tab changed it. Returns the unsubscribe function. */
  subscribe(onChange: (value: string) => void): () => void;
};

export function createTabChannel(key: string, win: Window): TabChannel {
  const listeners = new Set<(value: string) => void>();
  // The value this tab last published or was told about; read lazily on first use.
  let known: string | null = null;

  function read(): string | null {
    try {
      return win.localStorage.getItem(key) ?? "";
    } catch {
      return null; // storage blocked: no sync
    }
  }

  function knownValue(): string | null {
    known ??= read();
    return known;
  }

  function check(): void {
    const previous = knownValue();
    const current = read();
    if (current === null || previous === null || current === previous) return;
    known = current;
    for (const listener of listeners) listener(current);
  }

  const onStorage = (event: Event) => {
    const changed = (event as StorageEvent).key;
    if (changed === null || changed === key) check(); // null key = storage cleared
  };
  const onVisible = () => {
    if (win.document.visibilityState === "visible") check();
  };

  return {
    publish(value) {
      if (knownValue() === null) return;
      known = value;
      if (read() === value) return;
      try {
        win.localStorage.setItem(key, value);
      } catch {
        // storage blocked: no sync
      }
    },
    subscribe(onChange) {
      knownValue();
      if (listeners.size === 0) {
        win.addEventListener("storage", onStorage);
        win.addEventListener("pageshow", check);
        win.document.addEventListener("visibilitychange", onVisible);
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size > 0) return;
        win.removeEventListener("storage", onStorage);
        win.removeEventListener("pageshow", check);
        win.document.removeEventListener("visibilitychange", onVisible);
      };
    },
  };
}

const channels = new Map<string, TabChannel>();

/** Client-only, one channel per key on the real window. Call from effects or event handlers, never at module load. */
export function tabChannel(key: string): TabChannel {
  let channel = channels.get(key);
  if (!channel) {
    channel = createTabChannel(key, window);
    channels.set(key, channel);
  }
  return channel;
}
