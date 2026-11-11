// Tiny external store: "this tab just sent an application linked to the signed-in account". The navs hide "Başvur"
// as soon as it is set: `submitApplication` doesn't `refresh()` (it would replace the success card), so the streamed
// navs keep their old answer until the next page load. Module memory only; the stored hint (`writeApplyHint`) covers
// the next load. Read with useSyncExternalStore(subscribeApplySubmitted, getApplySubmitted, () => false).
let submitted = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  if (submitted === value) return;
  submitted = value;
  for (const listener of listeners) listener();
}

/** After a successful application linked to the signed-in account. */
export function markApplySubmitted(): void {
  set(true);
}

/** On sign-out: the signed-out visitor in this tab sees "Başvur" again. */
export function clearApplySubmitted(): void {
  set(false);
}

/** Subscribes to changes; returns the unsubscribe function. */
export function subscribeApplySubmitted(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getApplySubmitted(): boolean {
  return submitted;
}
