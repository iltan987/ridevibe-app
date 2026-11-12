// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  INSTALL_CHANGE_EVENT,
  INSTALL_DISMISSED_KEY,
  INSTALL_INSTALLED_KEY,
  INSTALL_PROMPT_PROP,
  installCaptureScript,
} from "./install-script.ts";

function fakeWindow(setItem?: (k: string, v: string) => void) {
  const store = new Map<string, string>();
  const target = new EventTarget();
  const changes: string[] = [];
  target.addEventListener(INSTALL_CHANGE_EVENT, () => changes.push(INSTALL_CHANGE_EVENT));
  const win = Object.assign(target, {
    Event,
    localStorage: { setItem: setItem ?? ((k: string, v: string) => void store.set(k, v)) },
  }) as unknown as Record<string, unknown> & EventTarget;
  return { win, store, changes };
}

function fakePromptEvent(type: string) {
  const calls = { prevented: 0 };
  const e = Object.assign(new Event(type), {
    preventDefault() {
      calls.prevented++;
    },
  });
  return { e, calls };
}

const run = (win: unknown) => vm.runInNewContext(installCaptureScript, { window: win });

test("constants", () => {
  assert.equal(INSTALL_DISMISSED_KEY, "rv-install-dismissed");
  assert.equal(INSTALL_INSTALLED_KEY, "rv-install-installed");
  assert.equal(INSTALL_CHANGE_EVENT, "rv-install-change");
  assert.equal(INSTALL_PROMPT_PROP, "__rvInstallPrompt");
});

test("beforeinstallprompt: prevented, stored on window, change dispatched once", () => {
  const { win, changes } = fakeWindow();
  run(win);
  const { e, calls } = fakePromptEvent("beforeinstallprompt");
  win.dispatchEvent(e);
  assert.equal(calls.prevented, 1);
  assert.equal(win[INSTALL_PROMPT_PROP], e);
  assert.equal(changes.length, 1);
});

test("appinstalled: prompt cleared, installed flag stored, change dispatched", () => {
  const { win, store, changes } = fakeWindow();
  run(win);
  win.dispatchEvent(fakePromptEvent("beforeinstallprompt").e);
  win.dispatchEvent(new Event("appinstalled"));
  assert.equal(win[INSTALL_PROMPT_PROP], null);
  assert.equal(store.get(INSTALL_INSTALLED_KEY), "1");
  assert.equal(changes.length, 2);
});

test("appinstalled: setItem throwing does not throw, prompt still cleared", () => {
  const { win, changes } = fakeWindow(() => {
    throw new Error("denied");
  });
  run(win);
  win.dispatchEvent(fakePromptEvent("beforeinstallprompt").e);
  assert.doesNotThrow(() => win.dispatchEvent(new Event("appinstalled")));
  assert.equal(win[INSTALL_PROMPT_PROP], null);
  assert.equal(changes.length, 2);
});

test("running the script twice registers listeners once", () => {
  const { win, changes } = fakeWindow();
  run(win);
  run(win);
  const { e, calls } = fakePromptEvent("beforeinstallprompt");
  win.dispatchEvent(e);
  assert.equal(calls.prevented, 1);
  assert.equal(changes.length, 1);
});
