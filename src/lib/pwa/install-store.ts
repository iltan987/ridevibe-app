// Install state for the "install the app" prompt: combines the held `beforeinstallprompt` event, the platform rules,
// the installed signals and the dismissal into one snapshot. Read with
// useSyncExternalStore(store.subscribe, store.getSnapshot, () => NO_INSTALL).
// Dependency-free (relative `.ts` imports) so `node --test` can load it; nothing touches `window` at module load.
import {
  INSTALL_CHANGE_EVENT,
  INSTALL_DISMISSED_KEY,
  INSTALL_INSTALLED_KEY,
  INSTALL_PROMPT_PROP,
} from "./install-script.ts";
import { detectInstallPlatform, installVariant, isDismissed, showsBanner, type InstallVariant } from "./platform.ts";

export type InstallSnapshot = { variant: InstallVariant; banner: boolean };
export const NO_INSTALL: InstallSnapshot = { variant: "none", banner: false };

export type InstallEnv = {
  window: Window;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
};

// Arrow-function properties: callers may pass them on unbound (none of them uses `this`).
export type InstallStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => InstallSnapshot;
  install: () => Promise<void>;
  dismiss: () => void;
};

type InstallPromptEvent = { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
// lib.dom declares maxTouchPoints and userActivation, but older browsers lack them: kept optional.
type Nav = Omit<Navigator, "maxTouchPoints" | "userActivation"> & {
  maxTouchPoints?: number;
  standalone?: boolean;
  userActivation?: { hasBeenActive: boolean };
  getInstalledRelatedApps?: () => Promise<unknown[]>;
};

const STANDALONE_QUERY = "(display-mode: standalone)";
const POLL_MS = 1_000;
const FALLBACK_AFTER_ACTIVATION_MS = 30_000;

export function createInstallStore(env: InstallEnv): InstallStore {
  const win = env.window;
  const nav = win.navigator as Nav;
  const listeners = new Set<() => void>();
  let snapshot: InstallSnapshot | null = null;
  let started = false;
  let relatedInstalled = false;
  // The system dialog was accepted: treat as installed for this page's lifetime. Not stored, because the install can
  // still fail; `appinstalled` stores the flag once it really happened.
  let accepted = false;
  let androidFallback = false;
  let watchTimer: number | undefined;

  const heldPrompt = () => (win as unknown as Record<string, InstallPromptEvent | null>)[INSTALL_PROMPT_PROP];

  function readStorage(key: string): string | null {
    try {
      return win.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  const platform = () => detectInstallPlatform({ userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0 });

  function compute(): InstallSnapshot {
    let standalone = false;
    try {
      standalone = win.matchMedia(STANDALONE_QUERY).matches;
    } catch {
      // no matchMedia: not standalone
    }
    const installed =
      accepted ||
      standalone ||
      nav.standalone === true ||
      readStorage(INSTALL_INSTALLED_KEY) === "1" ||
      relatedInstalled;
    const variant = installVariant({
      platform: platform(),
      hasPrompt: Boolean(heldPrompt()),
      installed,
      androidFallback,
    });
    const raw = readStorage(INSTALL_DISMISSED_KEY);
    const dismissedAt = raw === null || Number.isNaN(Number(raw)) ? null : Number(raw);
    return { variant, banner: showsBanner(variant) && !isDismissed(dismissedAt, env.now()) };
  }

  // Recompute; the cached object is replaced (and listeners called) only when variant or banner changed.
  function update(): void {
    const next = compute();
    if (snapshot && snapshot.variant === next.variant && snapshot.banner === next.banner) return;
    const first = snapshot === null;
    snapshot = next;
    if (!first) for (const listener of listeners) listener();
  }

  function stopWatch(): void {
    if (watchTimer !== undefined) env.clearTimeout(watchTimer);
    watchTimer = undefined;
  }

  // Android Chrome fires `beforeinstallprompt` only when installable. If it never comes (already installed elsewhere,
  // not installable...), offer the manual guide 30 s after the first user activation.
  function startAndroidWatch(): void {
    if (androidFallback || watchTimer !== undefined || heldPrompt()) return;
    if (platform() !== "android") return;
    if (!("BeforeInstallPromptEvent" in win)) {
      androidFallback = true;
      return;
    }
    const poll = () => {
      if (nav.userActivation?.hasBeenActive) {
        watchTimer = env.setTimeout(() => {
          watchTimer = undefined;
          androidFallback = true;
          update();
        }, FALLBACK_AFTER_ACTIVATION_MS);
      } else {
        watchTimer = env.setTimeout(poll, POLL_MS);
      }
    };
    watchTimer = env.setTimeout(poll, POLL_MS);
  }

  function start(): void {
    started = true;
    win.addEventListener(INSTALL_CHANGE_EVENT, () => {
      if (heldPrompt()) stopWatch();
      update();
    });
    win.addEventListener("storage", update);
    try {
      win.matchMedia(STANDALONE_QUERY).addEventListener("change", update);
    } catch {
      // no matchMedia
    }
    try {
      nav.getInstalledRelatedApps?.().then(
        (apps) => {
          if (apps.length > 0) {
            relatedInstalled = true;
            update();
          }
        },
        () => {},
      );
    } catch {
      // unsupported or blocked
    }
    startAndroidWatch();
    update();
  }

  function dismiss(): void {
    try {
      win.localStorage.setItem(INSTALL_DISMISSED_KEY, String(env.now()));
    } catch {
      // storage unavailable: nothing is remembered, so the banner stays (follow-up: in-memory fallback)
    }
    update();
  }

  return {
    // Listeners and timers start on the first subscribe and are never torn down: the store lives as long as the page,
    // and unsubscribing only removes the listener from the set.
    subscribe(listener) {
      listeners.add(listener);
      if (!started) start();
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      if (snapshot === null) snapshot = compute();
      return snapshot;
    },
    async install() {
      const event = heldPrompt();
      if (!event) return;
      // A BeforeInstallPromptEvent works once: drop it before using it.
      (win as unknown as Record<string, unknown>)[INSTALL_PROMPT_PROP] = null;
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        if (outcome === "accepted") accepted = true;
        else if (outcome === "dismissed") dismiss();
      } catch {
        // already used or blocked: drop it and fall back to the platform's guide (on Android the manual one, at once)
        if (platform() === "android") androidFallback = true;
      }
      update();
      if (started) startAndroidWatch();
    },
    dismiss,
  };
}

let singleton: InstallStore | undefined;

/** Client-only singleton on the real window. Call from client code only, never at module load. */
export function installStore(): InstallStore {
  singleton ??= createInstallStore({
    window,
    now: () => Date.now(),
    // called on `window`: browsers throw "Illegal invocation" when setTimeout is called with another `this`
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  });
  return singleton;
}
