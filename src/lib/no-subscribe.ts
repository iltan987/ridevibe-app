/**
 * `subscribe` for `useSyncExternalStore(noSubscribe, client, server)`: client-only values that never change after
 * hydration (the user agent, "hydrated"). One module-level function, so React never resubscribes.
 */
export const noSubscribe: (onStoreChange: () => void) => () => void = () => noop;

function noop() {
  // nothing to unsubscribe from
}
