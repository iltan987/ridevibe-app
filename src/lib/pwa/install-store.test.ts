// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INSTALL_CHANGE_EVENT,
  INSTALL_DISMISSED_KEY,
  INSTALL_INSTALLED_KEY,
  INSTALL_PROMPT_PROP,
} from "./install-script.ts";
import { createInstallStore, NO_INSTALL, type InstallEnv } from "./install-store.ts";
import { DISMISS_MS } from "./platform.ts";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1";

type Opts = {
  ua: string;
  bipEvent?: boolean; // window defines BeforeInstallPromptEvent
  standalone?: boolean;
  activation?: boolean;
  storageThrows?: boolean;
  related?: () => Promise<unknown[]>;
};

function fakePrompt(outcome: "accepted" | "dismissed" | "throws") {
  const calls = { prompt: 0 };
  const ev = {
    prompt: async () => {
      calls.prompt++;
      if (outcome === "throws") throw new Error("already used");
    },
    userChoice: Promise.resolve({ outcome }),
  };
  return { ev, calls };
}

function makeEnv(o: Opts) {
  const target = new EventTarget();
  const data = new Map<string, string>();
  const mqTarget = new EventTarget();
  const mql = Object.assign(mqTarget, { matches: o.standalone === true });
  let clock = 1_000_000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextId = 1;
  const navigator: Record<string, unknown> = {
    userAgent: o.ua,
    maxTouchPoints: 0,
    userActivation: { hasBeenActive: o.activation === true },
  };
  if (o.related) navigator.getInstalledRelatedApps = o.related;
  const win = Object.assign(target, {
    navigator,
    matchMedia: () => mql,
    [INSTALL_PROMPT_PROP]: null as unknown,
  }) as unknown as Record<string, unknown> & EventTarget;
  Object.defineProperty(win, "localStorage", {
    get() {
      if (o.storageThrows) throw new Error("denied");
      return {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
      };
    },
  });
  if (o.bipEvent) win.BeforeInstallPromptEvent = class {};
  const env: InstallEnv = {
    window: win as unknown as Window,
    now: () => clock,
    setTimeout: ((fn: () => void, ms: number) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id: number) => {
      timers = timers.filter((t) => t.id !== id);
    }) as unknown as typeof clearTimeout,
  };
  function advance(ms: number) {
    const end = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((t) => t !== due);
      clock = due.at;
      due.fn();
    }
    clock = end;
  }
  return {
    env,
    win,
    data,
    navigator,
    advance,
    hold: (ev: unknown) => {
      win[INSTALL_PROMPT_PROP] = ev;
    },
    emit: (type: string) => win.dispatchEvent(new Event(type)),
    setActivation: () => {
      (navigator.userActivation as { hasBeenActive: boolean }).hasBeenActive = true;
    },
    mql,
  };
}

const flush = () => new Promise((r) => setImmediate(r));

test("Android with a held event: prompt + banner, stable snapshot reference", () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  t.hold(fakePrompt("accepted").ev);
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot(), { variant: "prompt", banner: true });
  assert.equal(store.getSnapshot(), store.getSnapshot());
});

test("install() uses the event once and drops it", async () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  const { ev, calls } = fakePrompt("accepted");
  t.hold(ev);
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  await store.install();
  assert.equal(calls.prompt, 1);
  assert.equal(t.win[INSTALL_PROMPT_PROP], null);
  await store.install();
  assert.equal(calls.prompt, 1);
});

test("dismissed outcome: banner off, dismissal stored, variant falls back", async () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  t.hold(fakePrompt("dismissed").ev);
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  await store.install();
  assert.deepEqual(store.getSnapshot(), { variant: "none", banner: false });
  assert.equal(t.data.get(INSTALL_DISMISSED_KEY), String(t.env.now()));
});

test("prompt() rejecting does not throw and falls back to the Android guide at once", async () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  t.hold(fakePrompt("throws").ev);
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  await store.install();
  assert.equal(t.win[INSTALL_PROMPT_PROP], null);
  assert.deepEqual(store.getSnapshot(), { variant: "android-manual", banner: true });
});

test("accepted outcome: nothing shown for the rest of the page, even with the fallback elapsed", async () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  t.setActivation();
  t.advance(31_000);
  assert.equal(store.getSnapshot().variant, "android-manual");
  t.hold(fakePrompt("accepted").ev);
  t.emit(INSTALL_CHANGE_EVENT);
  assert.equal(store.getSnapshot().variant, "prompt");
  await store.install();
  assert.deepEqual(store.getSnapshot(), NO_INSTALL);
  t.advance(60_000);
  t.emit("storage");
  assert.deepEqual(store.getSnapshot(), NO_INSTALL);
  assert.equal(t.data.get(INSTALL_INSTALLED_KEY), undefined); // not stored: the install could still fail
});

test("a new event after a dismissed outcome: menu usable, banner still dismissed", async () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  t.hold(fakePrompt("dismissed").ev);
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  await store.install();
  t.hold(fakePrompt("accepted").ev);
  t.emit(INSTALL_CHANGE_EVENT);
  assert.deepEqual(store.getSnapshot(), { variant: "prompt", banner: false });
});

test("iPhone Safari: guide banner, dismiss for 30 days, shows again after", () => {
  const t = makeEnv({ ua: IPHONE_UA });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot(), { variant: "ios-safari", banner: true });
  store.dismiss();
  assert.deepEqual(store.getSnapshot(), { variant: "ios-safari", banner: false });
  t.advance(DISMISS_MS);
  t.emit("storage");
  assert.deepEqual(store.getSnapshot(), { variant: "ios-safari", banner: true });
});

test("installed in another tab (storage event) hides everything and notifies", () => {
  const t = makeEnv({ ua: IPHONE_UA });
  const store = createInstallStore(t.env);
  let calls = 0;
  store.subscribe(() => calls++);
  store.getSnapshot();
  t.data.set(INSTALL_INSTALLED_KEY, "1");
  t.emit("storage");
  assert.deepEqual(store.getSnapshot(), NO_INSTALL);
  assert.equal(calls, 1);
});

test("standalone display mode: variant none, reacts to media query changes", () => {
  const t = makeEnv({ ua: IPHONE_UA, standalone: true });
  const store = createInstallStore(t.env);
  let calls = 0;
  store.subscribe(() => calls++);
  assert.equal(store.getSnapshot().variant, "none");
  t.mql.matches = false;
  t.mql.dispatchEvent(new Event("change"));
  assert.equal(store.getSnapshot().variant, "ios-safari");
  assert.equal(calls, 1);
});

test("navigator.standalone === true counts as installed", () => {
  const t = makeEnv({ ua: IPHONE_UA });
  t.navigator.standalone = true;
  const store = createInstallStore(t.env);
  assert.equal(store.getSnapshot().variant, "none");
});

test("getInstalledRelatedApps non-empty marks installed; rejection is ignored", async () => {
  const a = makeEnv({ ua: IPHONE_UA, related: async () => [{ platform: "webapp" }] });
  const storeA = createInstallStore(a.env);
  let calls = 0;
  storeA.subscribe(() => calls++);
  assert.equal(storeA.getSnapshot().variant, "ios-safari");
  await flush();
  assert.equal(storeA.getSnapshot().variant, "none");
  assert.equal(calls, 1);

  const b = makeEnv({ ua: IPHONE_UA, related: async () => Promise.reject(new Error("nope")) });
  const storeB = createInstallStore(b.env);
  storeB.subscribe(() => {});
  await flush();
  assert.equal(storeB.getSnapshot().variant, "ios-safari");
});

test("Android without BeforeInstallPromptEvent: android-manual at once", () => {
  const t = makeEnv({ ua: ANDROID_UA });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot(), { variant: "android-manual", banner: true });
});

test("Android with BeforeInstallPromptEvent but no activation: none after 60 s", () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  t.advance(60_000);
  assert.equal(store.getSnapshot().variant, "none");
});

test("Android: activation, then 30 s later the manual guide", () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  const store = createInstallStore(t.env);
  let calls = 0;
  store.subscribe(() => calls++);
  t.advance(5_000);
  t.setActivation();
  t.advance(1_000); // poll notices the activation
  t.advance(29_000);
  assert.equal(store.getSnapshot().variant, "none");
  t.advance(1_000);
  assert.deepEqual(store.getSnapshot(), { variant: "android-manual", banner: true });
  assert.equal(calls, 1);
});

test("Android: the event arriving before the 30 s wins", () => {
  const t = makeEnv({ ua: ANDROID_UA, bipEvent: true });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  t.setActivation();
  t.advance(1_000);
  t.advance(10_000);
  t.hold(fakePrompt("accepted").ev);
  t.emit(INSTALL_CHANGE_EVENT);
  t.advance(60_000);
  assert.equal(store.getSnapshot().variant, "prompt");
});

test("localStorage getter throwing: banner shows, nothing throws", () => {
  const t = makeEnv({ ua: IPHONE_UA, storageThrows: true });
  const store = createInstallStore(t.env);
  store.subscribe(() => {});
  assert.deepEqual(store.getSnapshot(), { variant: "ios-safari", banner: true });
  assert.doesNotThrow(() => store.dismiss());
});

test("unsubscribed listeners are not called", () => {
  const t = makeEnv({ ua: IPHONE_UA });
  const store = createInstallStore(t.env);
  let calls = 0;
  const off = store.subscribe(() => calls++);
  off();
  store.dismiss();
  assert.equal(calls, 0);
});
