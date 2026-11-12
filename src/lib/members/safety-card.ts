"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { BloodType } from "./blood-type";
import type { Motorcycle } from "./format";
import type { EmergencyRelationship } from "./queries";

export type SafetyCard = {
  fullName: string;
  contacts: { position: number; name: string; relationship: EmergencyRelationship; phone: string }[];
  bloodType: BloodType | null;
  motorcycles: Motorcycle[];
};

export type SafetyCardResult = { status: "ok"; card: SafetyCard } | { status: "forbidden" | "notActive" | "error" };

const uuid = z.uuid();

/**
 * Emergency card of an active member (members.safety only; every call is access-logged by the RPC). Reads only:
 * no refresh(), and nothing personal is logged.
 */
export async function getSafetyCard(profileId: string): Promise<SafetyCardResult> {
  const parsedId = uuid.safeParse(profileId);
  if (!parsedId.success) return { status: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_safety_card", { target: parsedId.data });
  if (error) {
    if (error.code === "42501") return { status: "forbidden" };
    if (error.code === "P0002") return { status: "notActive" };
    console.error("getSafetyCard failed", { code: error.code });
    return { status: "error" };
  }
  const row = data[0];
  if (!row) return { status: "error" };

  return {
    status: "ok",
    card: {
      fullName: row.full_name,
      contacts: Array.isArray(row.contacts) ? (row.contacts as SafetyCard["contacts"]) : [],
      bloodType: (row.blood_type as BloodType | null) ?? null,
      motorcycles: Array.isArray(row.motorcycles) ? (row.motorcycles as Motorcycle[]) : [],
    },
  };
}
