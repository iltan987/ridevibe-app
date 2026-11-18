// The status buttons of a row on the admin members list. Dependency-free so `node --test` can run its tests.

import type { StaffStatus } from "./members-view.ts";

export type StatusAction = {
  status: StaffStatus;
  label: "toProbation" | "promote" | "deactivate";
  /** The main next step (default button); the rest are outline buttons. */
  primary: boolean;
};

const TO_PROBATION = { status: "probation", label: "toProbation" } as const;
const PROMOTE = { status: "active", label: "promote" } as const;
const DEACTIVATE = { status: "inactive", label: "deactivate" } as const;

/** What staff can do next with an account; never pending → active (the database refuses it: ön alım comes first). */
export function statusActions(status: StaffStatus): StatusAction[] {
  switch (status) {
    case "pending":
      return [{ ...TO_PROBATION, primary: true }];
    case "probation":
      return [
        { ...PROMOTE, primary: true },
        { ...DEACTIVATE, primary: false },
      ];
    case "active":
      return [{ ...DEACTIVATE, primary: false }];
    case "inactive":
      return [
        { ...TO_PROBATION, primary: true },
        { ...PROMOTE, primary: false },
      ];
  }
}
