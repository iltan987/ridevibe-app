"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { PUBLIC_EVENTS_TAG } from "./public";
import { type JoinActionResult, joinResult, joinSchema, reasonFromHint } from "./join";
import { resolvePlace, type ResolvePlaceResult } from "./resolve-place";
import { eventInputSchema, toRpcArgs } from "./schema";

// Server Actions are public endpoints: the RPCs (events.manage, security definer) decide who may write. We validate
// shapes and translate error codes (supabase/schemas/40_events.sql header).

export type EventActionResult = { status: "ok" | "invalid" | "forbidden" | "notFound" | "error" };
export type SaveEventResult = { status: "ok"; id: string } | { status: "invalid" | "forbidden" | "notFound" | "error" };
export type DeleteEventResult = { status: EventActionResult["status"] | "hasSignups" };

const uuid = z.uuid();
const cancelReason = z.string().trim().max(200);

// 22023: rules the table checks can't judge; 23514 / 23505: table checks; the rest: Postgres casts of malformed JSON
// values (the schema rules them out, so only a hand-made request gets here).
const INVALID_CODES = new Set(["22023", "23514", "23505", "22P02", "22007", "22008", "22003"]);

function fail(code: string | undefined, where: string): { status: "invalid" | "forbidden" | "notFound" | "error" } {
  if (code === "42501") return { status: "forbidden" };
  if (code === "P0002") return { status: "notFound" };
  if (code !== undefined && INVALID_CODES.has(code)) return { status: "invalid" };
  console.error(`${where} failed`, { code });
  return { status: "error" };
}

/** A refusal that says the page the caller sees is stale (lost race, event gone): re-render it with fresh data. */
function refreshIfStale<T extends { status: string }>(result: T): T {
  if (result.status === "refused" || result.status === "notFound" || result.status === "hasSignups") refresh();
  return result;
}

/**
 * Reads a pasted place, following a short map link on the server. Organisers only: it makes this server request
 * a map host. Never logs the text (it can hold the sharer's position).
 */
export async function resolvePlaceLink(text: string): Promise<ResolvePlaceResult | { status: "forbidden" }> {
  if (typeof text !== "string" || text.length > 2000) return { status: "invalid" };
  const user = await getCurrentUser();
  if (!can(user?.access, "events.manage")) return { status: "forbidden" };
  return resolvePlace(text);
}

/** Creates (id null) or edits an event; returns its id. */
export async function saveEvent(id: string | null, input: unknown): Promise<SaveEventResult> {
  if (id !== null && !uuid.safeParse(id).success) return { status: "invalid" };
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const args = toRpcArgs(parsed.data);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_event", id === null ? args : { ...args, p_id: id });
  if (error) return refreshIfStale(fail(error.code, "saveEvent"));
  updateTag(PUBLIC_EVENTS_TAG);
  refresh();
  return { status: "ok", id: data };
}

export async function cancelEvent(id: string, reason: string): Promise<EventActionResult> {
  const input = z.object({ id: uuid, reason: cancelReason }).safeParse({ id, reason });
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_event", {
    p_id: input.data.id,
    ...(input.data.reason === "" ? {} : { p_reason: input.data.reason }),
  });
  if (error) return refreshIfStale(fail(error.code, "cancelEvent"));
  updateTag(PUBLIC_EVENTS_TAG);
  refresh();
  return { status: "ok" };
}

/** Deletes an event nobody has joined; with sign-ups the organiser cancels it instead (`hasSignups`). */
export async function deleteEvent(id: string): Promise<DeleteEventResult> {
  if (!uuid.safeParse(id).success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_event", { p_id: id });
  if (error) {
    if (error.code === "P0001" && reasonFromHint(error.hint) === "hasSignups")
      return refreshIfStale({ status: "hasSignups" as const });
    return refreshIfStale(fail(error.code, "deleteEvent"));
  }
  updateTag(PUBLIC_EVENTS_TAG);
  refresh();
  return { status: "ok" };
}

/** Joins an event, or edits the caller's own sign-up (role, guests). The RPC enforces every rule. */
export async function joinEvent(id: string, input: unknown): Promise<JoinActionResult> {
  if (!uuid.safeParse(id).success) return { status: "invalid" };
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_event", {
    p_event: id,
    p_role: parsed.data.role,
    p_guests: parsed.data.guests,
  });
  const result = joinResult(error);
  if (result.status === "error") console.error("joinEvent failed", { code: error?.code });
  if (result.status === "ok") refresh();
  return refreshIfStale(result);
}

export async function leaveEvent(id: string): Promise<JoinActionResult> {
  if (!uuid.safeParse(id).success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_event", { p_event: id });
  const result = joinResult(error);
  if (result.status === "error") console.error("leaveEvent failed", { code: error?.code });
  if (result.status === "ok") refresh();
  return refreshIfStale(result);
}
