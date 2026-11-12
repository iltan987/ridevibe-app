"use client";

import { useSyncExternalStore } from "react";
import { installStore, NO_INSTALL, type InstallSnapshot } from "@/lib/pwa/install-store";

const getServerSnapshot = () => NO_INSTALL;
// The store touches `window`: it is created only inside these client-side closures, never during render on the server.
const subscribe = (listener: () => void) => installStore().subscribe(listener);
const getSnapshot = () => installStore().getSnapshot();

export function useInstall(): InstallSnapshot & { install(): Promise<void>; dismiss(): void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...snapshot,
    install: () => installStore().install(),
    dismiss: () => installStore().dismiss(),
  };
}
