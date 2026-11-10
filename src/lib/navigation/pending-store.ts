// Tiny external store counting links whose navigation is pending.
// Read with useSyncExternalStore(subscribePending, getPendingCount, getServerPendingCount).
let count = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Marks one navigation as pending; returns an idempotent `end` that clears it. */
export function beginNavigation(): () => void {
  count += 1;
  emit();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    count -= 1;
    emit();
  };
}

/** Subscribes to count changes; returns the unsubscribe function. */
export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current number of pending navigations (primitive snapshot). */
export function getPendingCount(): number {
  return count;
}

/** Server snapshot: nothing is pending during SSR. */
export function getServerPendingCount(): 0 {
  return 0;
}
