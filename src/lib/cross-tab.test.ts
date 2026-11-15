// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authChanged,
  authMark,
  authRenderAction,
  createTabChannel,
  followsLocaleChange,
  localeEvent,
  localeOfEvent,
  localeSwitchedSince,
} from "./cross-tab.ts";

// A fake tab: Map-backed localStorage that counts writes, `storage`/`pageshow` on the window, `visibilitychange` on
// the document (where browsers fire it).
function fakeTab(initial: Record<string, string> = {}, { throwing = false } = {}) {
  const data = new Map(Object.entries(initial));
  let writes = 0;
  const state: { visibilityState: DocumentVisibilityState } = { visibilityState: "visible" };
  const document = Object.assign(new EventTarget(), state);
  const storage = {
    getItem(key: string) {
      if (throwing) throw new Error("blocked");
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (throwing) throw new Error("blocked");
      writes++;
      data.set(key, value);
    },
  };
  const win = Object.assign(new EventTarget(), { localStorage: storage, document });
  return {
    win,
    data,
    writes: () => writes,
    // Another tab wrote `value` (null = removed / storage cleared): the browser updates storage, then fires `storage`.
    otherTabWrites(key: string, value: string | null) {
      if (value === null) data.delete(key);
      else data.set(key, value);
      win.dispatchEvent(Object.assign(new Event("storage"), { key }));
    },
    // Another tab wrote while this one was frozen: storage changed, no event.
    changeSilently(key: string, value: string) {
      data.set(key, value);
    },
    show() {
      document.visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    hide() {
      document.visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    pageshow() {
      win.dispatchEvent(new Event("pageshow"));
    },
  };
}

test("publish writes a new value and skips an unchanged one", () => {
  const tab = fakeTab({ k: "a" });
  const channel = createTabChannel("k", tab.win);
  channel.publish("a");
  assert.equal(tab.writes(), 0);
  channel.publish("b");
  assert.equal(tab.data.get("k"), "b");
  assert.equal(tab.writes(), 1);
});

test("publishing an empty value to a missing key writes nothing (signed-out visitors leave no key)", () => {
  const tab = fakeTab();
  createTabChannel("k", tab.win).publish("");
  assert.equal(tab.data.has("k"), false);
  assert.equal(tab.writes(), 0);
});

test("a change from another tab reaches subscribers with the new value", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  tab.otherTabWrites("k", "b");
  assert.deepEqual(seen, ["b"]);
});

test("events for other keys and repeats of the known value are ignored", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  tab.otherTabWrites("other", "x");
  tab.otherTabWrites("k", "a");
  assert.deepEqual(seen, []);
});

test("a removed key or cleared storage counts as the empty value", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  tab.data.delete("k");
  tab.win.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
  assert.deepEqual(seen, [""]);
});

test("a change made while the tab was frozen is picked up when it becomes visible, once", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  tab.hide();
  tab.changeSilently("k", "b");
  tab.hide();
  assert.deepEqual(seen, [], "no check while hidden");
  tab.show();
  tab.show();
  assert.deepEqual(seen, ["b"]);
});

test("a change is picked up when the page comes back from the back/forward cache", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  tab.changeSilently("k", "b");
  tab.pageshow();
  assert.deepEqual(seen, ["b"]);
});

test("the tab's own publish is not reported back to it", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  const channel = createTabChannel("k", tab.win);
  channel.subscribe((v) => seen.push(v));
  channel.publish("b");
  tab.show();
  tab.pageshow();
  assert.deepEqual(seen, []);
});

test("the known value is read when the channel is first used, not when it is created", () => {
  const tab = fakeTab({ k: "a" });
  const channel = createTabChannel("k", tab.win);
  tab.changeSilently("k", "b");
  const seen: string[] = [];
  channel.subscribe((v) => seen.push(v));
  tab.show();
  assert.deepEqual(seen, []);
});

test("every subscriber hears a change once", () => {
  const tab = fakeTab({ k: "a" });
  const one: string[] = [];
  const two: string[] = [];
  const channel = createTabChannel("k", tab.win);
  channel.subscribe((v) => one.push(v));
  channel.subscribe((v) => two.push(v));
  tab.otherTabWrites("k", "b");
  assert.deepEqual([one, two], [["b"], ["b"]]);
});

test("after unsubscribing nothing is reported", () => {
  const tab = fakeTab({ k: "a" });
  const seen: string[] = [];
  const unsubscribe = createTabChannel("k", tab.win).subscribe((v) => seen.push(v));
  unsubscribe();
  tab.otherTabWrites("k", "b");
  tab.show();
  assert.deepEqual(seen, []);
});

test("a resubscribe after the last unsubscribe still compares against the last known value", () => {
  const tab = fakeTab({ k: "a" });
  const channel = createTabChannel("k", tab.win);
  channel.subscribe(() => {})();
  tab.changeSilently("k", "b");
  const seen: string[] = [];
  channel.subscribe((v) => seen.push(v));
  tab.show();
  assert.deepEqual(seen, ["b"]);
});

test("blocked storage neither throws nor reports changes", () => {
  const tab = fakeTab({}, { throwing: true });
  const seen: string[] = [];
  const channel = createTabChannel("k", tab.win);
  channel.subscribe((v) => seen.push(v));
  channel.publish("b");
  tab.win.dispatchEvent(Object.assign(new Event("storage"), { key: "k" }));
  tab.show();
  assert.deepEqual(seen, []);
});

test("pages with unsaved form input keep their language when another tab switches", () => {
  for (const path of ["/apply", "/account"]) assert.equal(followsLocaleChange(path), false, path);
  for (const path of ["/", "/members", "/admin/applications/123", "/applyx", "/sign-in"]) {
    assert.equal(followsLocaleChange(path), true, path);
  }
});

test('current() returns the stored value, "" for a missing key and null when storage is blocked', () => {
  assert.equal(createTabChannel("k", fakeTab({ k: "a" }).win).current(), "a");
  assert.equal(createTabChannel("k", fakeTab().win).current(), "");
  assert.equal(createTabChannel("k", fakeTab({}, { throwing: true }).win).current(), null);
});

// --- Language: every switch is an event, even to the language already stored.

test("switching to the language already stored still reaches the other tabs", () => {
  const tab = fakeTab({ k: localeEvent("en", 1) });
  const heard: string[] = [];
  createTabChannel("k", tab.win).subscribe((v) => heard.push(localeOfEvent(v)));
  // Another tab publishes a switch to "en" again (e.g. its own tab was Turkish while the store said "en").
  tab.otherTabWrites("k", localeEvent("en", 2));
  assert.deepEqual(heard, ["en"]);
});

test("localeOfEvent reads the locale back; values without a time are taken whole", () => {
  assert.equal(localeOfEvent(localeEvent("tr", 1794497069715)), "tr");
  assert.equal(localeOfEvent("en"), "en");
  assert.equal(localeOfEvent(""), "");
});

// --- Auth: the stored mark is "<user>@<server render time>"; user "" = signed out.

test("a render publishes when nothing is stored, except for signed-out visitors", () => {
  assert.equal(authRenderAction("", "u1", 100, null), "publish");
  assert.equal(authRenderAction("", "", 100, null), "none");
  assert.equal(authRenderAction("garbage", "u1", 100, null), "publish");
});

test("a render of the stored user changes nothing, older or newer", () => {
  assert.equal(authRenderAction(authMark("u1", 100), "u1", 50, null), "none");
  assert.equal(authRenderAction(authMark("u1", 100), "u1", 150, null), "none");
});

test("a newer render of another user publishes", () => {
  assert.equal(authRenderAction(authMark("u1", 100), "", 150, null), "publish");
  assert.equal(authRenderAction(authMark("", 100), "u2", 150, null), "publish");
});

test("an older render of another user refreshes instead of overwriting (tab shown late)", () => {
  // Rendered as u1 in the background at 50; meanwhile another tab signed out (stored at 100).
  assert.equal(authRenderAction(authMark("", 100), "u1", 50, null), "refresh");
});

test("after one refresh for the same stored mark, the fresh render wins (server clocks may differ)", () => {
  const stored = authMark("", 100);
  assert.equal(authRenderAction(stored, "u1", 90, stored), "publish");
  assert.equal(authRenderAction(stored, "u1", 90, authMark("", 80)), "refresh");
});

test("a change matters only when the stored user differs from the one this tab shows", () => {
  assert.equal(authChanged(authMark("u1", 200), "u1"), false);
  assert.equal(authChanged(authMark("u2", 200), "u1"), true);
  assert.equal(authChanged(authMark("", 200), "u1"), true);
  assert.equal(authChanged("", "u1"), true, "storage cleared while signed in");
  assert.equal(authChanged("", ""), false);
});

test("a tab shown late catches up only with a switch made after its page loaded", () => {
  assert.equal(localeSwitchedSince(localeEvent("en", 200), 100), "en");
  assert.equal(localeSwitchedSince(localeEvent("en", 50), 100), null, "older switch: the page already loaded with it");
  assert.equal(localeSwitchedSince("en", 100), null, "no time");
  assert.equal(localeSwitchedSince("", 100), null);
});
