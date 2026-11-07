"use server";

import { createClient } from "@/lib/supabase/server";
import { type ApplicationFieldErrors, validateApplication } from "./schema";

export type SubmitApplicationResult =
  | { status: "success" }
  | { status: "invalid"; fieldErrors: ApplicationFieldErrors }
  | { status: "duplicate" }
  | { status: "error" };

export async function submitApplication(formData: FormData): Promise<SubmitApplicationResult> {
  // Honeypot: invisible to people, bots fill it in. Pretend success.
  if (String(formData.get("website") ?? "") !== "") return { status: "success" };

  const result = validateApplication(formData);
  if (!result.ok) return { status: "invalid", fieldErrors: result.fieldErrors };

  // Insert as the visitor (anon or signed in); RLS + column grants allow only
  // applicant columns. No `.select()`: the public can't read applications.
  const supabase = await createClient();
  const { error } = await supabase.from("applications").insert(result.data);

  if (!error) return { status: "success" };
  if (error.code === "23505") return { status: "duplicate" };
  // Log only the code, never the submitted personal data (KVKK).
  console.error("submitApplication failed", { code: error.code });
  return { status: "error" };
}
