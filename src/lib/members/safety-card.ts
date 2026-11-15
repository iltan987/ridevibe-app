"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { BloodType } from "./blood-type";
import type { Motorcycle } from "./format";
import { parseMotorcycles, parseSafetyContacts, type SafetyContact } from "./rpc-json";

export type SafetyCard = {
  fullName: string;
  contacts: SafetyContact[];
  bloodType: BloodType | null;
  motorcycles: Motorcycle[];
};

type GeneratedSafetyCardRow = Database["public"]["Functions"]["member_safety_card"]["Returns"][number];
/** A member_safety_card row: the generated types call every column non-null; blood_type is null when not given. */
type SafetyCardRow = Omit<GeneratedSafetyCardRow, "blood_type"> & { blood_type: BloodType | null };

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
  const row: SafetyCardRow | undefined = data.at(0);
  if (!row) return { status: "error" };

  return {
    status: "ok",
    card: {
      fullName: row.full_name,
      contacts: parseSafetyContacts(row.contacts),
      bloodType: row.blood_type,
      motorcycles: parseMotorcycles(row.motorcycles),
    },
  };
}
