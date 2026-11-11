import { UTM_KEYS } from "./options.ts";
import { ARRAY_FIELDS } from "./schema.ts";
import { APPLY_STEPS, STEP_COUNT } from "./steps.ts";

export const DRAFT_KEY = "rv-apply-draft";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type ApplyDraft = {
  v: 1;
  savedAt: string;
  step: number;
  fields: Record<string, string | string[]>;
  utm: Partial<Record<(typeof UTM_KEYS)[number], string>>;
};

// Only the first three steps are saved: contact details and consents are never stored in the browser.
export const DRAFT_FIELDS: ReadonlySet<string> = new Set(APPLY_STEPS.slice(0, STEP_COUNT - 1).flatMap((step) => step.fields));

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function clampStep(step: unknown): number {
  const n = typeof step === "number" && Number.isFinite(step) ? Math.trunc(step) : 1;
  return Math.min(Math.max(n, 1), STEP_COUNT);
}

export function buildDraft(formData: FormData, step: number, now: Date): ApplyDraft | null {
  const fields: ApplyDraft["fields"] = {};
  for (const field of DRAFT_FIELDS) {
    if (ARRAY_FIELDS.has(field)) {
      const values = formData.getAll(field).filter((v): v is string => typeof v === "string" && v !== "");
      if (values.length > 0) fields[field] = values;
    } else {
      const value = formData.get(field);
      if (typeof value === "string" && value !== "") fields[field] = value;
    }
  }
  if (Object.keys(fields).length === 0) return null;

  const utm: ApplyDraft["utm"] = {};
  for (const key of UTM_KEYS) {
    const value = formData.get(key);
    if (typeof value === "string" && value !== "") utm[key] = value;
  }
  return { v: 1, savedAt: now.toISOString(), step: clampStep(step), fields, utm };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDraft(raw: string | null, now: Date): ApplyDraft | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1) return null;
  if (typeof data.savedAt !== "string") return null;
  const saved = Date.parse(data.savedAt);
  if (Number.isNaN(saved)) return null;
  const age = now.getTime() - saved;
  if (age > DRAFT_MAX_AGE_MS || age < -FUTURE_TOLERANCE_MS) return null;
  if (!isRecord(data.fields)) return null;

  const fields: ApplyDraft["fields"] = {};
  for (const [key, value] of Object.entries(data.fields)) {
    if (!DRAFT_FIELDS.has(key)) continue;
    if (ARRAY_FIELDS.has(key)) {
      if (!Array.isArray(value)) continue;
      const items = value.filter((v): v is string => typeof v === "string");
      if (items.length > 0) fields[key] = items;
    } else if (typeof value === "string") {
      fields[key] = value;
    }
  }
  // Nothing left to restore (e.g. only fields that are never stored): treat it as no draft.
  if (Object.keys(fields).length === 0) return null;

  const utm: ApplyDraft["utm"] = {};
  if (isRecord(data.utm)) {
    for (const key of UTM_KEYS) {
      const value = data.utm[key];
      if (typeof value === "string") utm[key] = value;
    }
  }
  return { v: 1, savedAt: data.savedAt, step: clampStep(data.step), fields, utm };
}

export function browserStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null; // blocked in some private modes and webviews
  }
}

export function readDraft(storage: DraftStorage | null, now: Date): ApplyDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null) return null;
    const draft = parseDraft(raw, now);
    if (!draft) storage.removeItem(DRAFT_KEY);
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(storage: DraftStorage | null, draft: ApplyDraft | null): void {
  if (!storage) return;
  try {
    if (draft) storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else storage.removeItem(DRAFT_KEY);
  } catch {
    // quota exceeded or storage disabled: the draft is a convenience, never an error
  }
}

export function clearDraft(storage: DraftStorage | null): void {
  writeDraft(storage, null);
}

export const DRAFT_SAVE_DELAY_MS = 500;

/**
 * Debounced draft writes for the application form. `read` snapshots the form when the save runs (a detached form
 * element still has its values, so a save flushed on unmount works). After `stop()` (successful submit) nothing
 * writes again, so a late save can't re-create the draft that was just deleted.
 */
export type DraftSaver = {
  /** Saves `read()` at `step` after the delay; a newer call replaces a pending one. */
  schedule(read: () => FormData, step: number): void;
  /** Writes a pending save now (unmount, `pagehide`); nothing pending → nothing written. */
  flush(): void;
  /** Cancels a pending save and writes immediately (before leaving the page on purpose). */
  saveNow(read: () => FormData, step: number): void;
  /** Cancels and ignores every later call. */
  stop(): void;
};

export function createDraftSaver(
  storage: () => DraftStorage | null,
  now: () => Date = () => new Date(),
  delayMs = DRAFT_SAVE_DELAY_MS,
): DraftSaver {
  let pending: { timer: ReturnType<typeof setTimeout>; read: () => FormData; step: number } | null = null;
  let stopped = false;

  function write(read: () => FormData, step: number) {
    if (!stopped) writeDraft(storage(), buildDraft(read(), step, now()));
  }
  function cancel() {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  }
  function flush() {
    const job = pending;
    cancel();
    if (job) write(job.read, job.step);
  }

  return {
    schedule(read, step) {
      cancel();
      if (stopped) return;
      pending = { timer: setTimeout(flush, delayMs), read, step };
    },
    flush,
    saveNow(read, step) {
      cancel();
      write(read, step);
    },
    stop() {
      cancel();
      stopped = true;
    },
  };
}
