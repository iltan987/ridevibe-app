// Parses the jsonb columns of the member RPCs (member_directory, member_safety_card): the generated types call them
// `Json`. Not an array → []; an item of another shape is dropped. Relative `.ts` imports so `node --test` can load it.
import { z } from "zod";
import { Constants } from "../supabase/database.types.ts";
import type { Motorcycle } from "./format.ts";

const motorcycle = z.object({
  brand: z.string(),
  model: z.string(),
  cc: z.number().nullable(),
  plate: z.string().nullable().optional(),
}) satisfies z.ZodType<Motorcycle>;

const safetyContact = z.object({
  position: z.number(),
  name: z.string(),
  relationship: z.enum(Constants.public.Enums.emergency_relationship),
  phone: z.string(),
});

export type SafetyContact = z.infer<typeof safetyContact>;

function parseEach<T>(item: z.ZodType<T>, value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    const parsed = item.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export const parseMotorcycles = (value: unknown): Motorcycle[] => parseEach(motorcycle, value);

export const parseSafetyContacts = (value: unknown): SafetyContact[] => parseEach(safetyContact, value);
