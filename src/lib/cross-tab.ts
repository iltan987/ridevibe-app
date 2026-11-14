// Cross-tab sync: one `localStorage` key per topic (who is signed in, the chosen language). A tab publishes a value;
// the other tabs hear it through the `storage` event (fires only in the *other* tabs, also hidden ones). A tab the
// browser froze in the background gets no events, so the value is compared again when the tab becomes visible or comes
// back from the back/forward cache. A missing key counts as "".
// The stored value can be older than what a tab shows (it outlives the session; a tab opened in the background mounts
// only when first shown), so no topic compares "same as stored": a language switch stores a unique value (an event),
// and the auth mark carries the server render time, so an older render never overwrites a newer one.
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

/** The stored value for a language switch: unique per switch, so switching to the stored language still notifies. */
export function localeEvent(locale: string, now: number): string {
  return `${locale}@${now}`;
}

export function localeOfEvent(value: string): string {
  const at = value.lastIndexOf("@");
  return at === -1 ? value : value.slice(0, at);
}

/**
 * The locale of a switch stored after `since` (this page's load time, `performance.timeOrigin`), else null. A tab
 * opened in the background hydrates its header only when first shown, so it can miss the event; it catches up on
 * mount. Both times come from this device's clock.
 */
export function localeSwitchedSince(value: string, since: number): string | null {
  const at = value.lastIndexOf("@");
  const time = Number(value.slice(at + 1));
  return at !== -1 && value.slice(at + 1) !== "" && time > since ? value.slice(0, at) : null;
}

// Auth mark: "<user>@<server render time in ms>"; user = a short hash of the account id, "" = signed out.

export function authMark(user: string, renderedAt: number): string {
  return `${user}@${renderedAt}`;
}

function parseAuthMark(value: string): { user: string; at: number } | null {
  const at = value.lastIndexOf("@");
  const time = Number(value.slice(at + 1));
  return at === -1 || !Number.isFinite(time) ? null : { user: value.slice(0, at), at: time };
}

/**
 * What a tab does with its own render (user, server render time), given the stored mark:
 * - "publish": it is the newest news (or nothing valid is stored and someone is signed in);
 * - "refresh": it is older than a stored mark of another user (e.g. shown late): ask the server again;
 * - "none": it agrees with the store, or a signed-out visitor with nothing stored (leave no key).
 * `refreshedFor` = the stored mark this tab already refreshed for: then the fresh render wins, so a server clock
 * that runs behind can't cause a refresh loop.
 */
export function authRenderAction(
  stored: string,
  user: string,
  renderedAt: number,
  refreshedFor: string | null,
): "publish" | "refresh" | "none" {
  const mark = parseAuthMark(stored);
  if (!mark) return user ? "publish" : "none";
  if (mark.user === user) return "none";
  if (renderedAt >= mark.at || refreshedFor === stored) return "publish";
  return "refresh";
}

/** Whether a mark stored by another tab means this tab (showing `user`) is out of date. */
export function authChanged(stored: string, user: string): boolean {
  return (parseAuthMark(stored)?.user ?? "") !== user;
}

export type TabChannel = {
  /** The stored value ("" if missing), or null when storage is blocked. */
  current(): string | null;
  /** Store a value; other tabs whose last known value differs are notified. */
  publish(value: string): void;
  /** Called with the new value when another tab changed it. Returns the unsubscribe function. */
  subscribe(onChange: (value: string) => void): () => void;
};

type Listeners = Pick<EventTarget, "addEventListener" | "removeEventListener">;
/** What a channel uses of `window` (tests pass a fake). */
type TabWindow = Listeners & {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  document: Listeners & Pick<Document, "visibilityState">;
};

export function createTabChannel(key: string, win: TabWindow): TabChannel {
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
    const changed = "key" in event ? event.key : undefined; // a StorageEvent's key
    if (changed === null || changed === key) check(); // null key = storage cleared
  };
  const onVisible = () => {
    if (win.document.visibilityState === "visible") check();
  };

  return {
    current: read,
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
