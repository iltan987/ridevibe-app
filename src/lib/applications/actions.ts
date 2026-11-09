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
  // Signed in: link the application to the account. The id comes from the
  // verified session, never from form data; RLS allows only the own id.
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  // Continue unlinked; log only the code (KVKK).
  if (authError) console.error("submitApplication: getClaims failed", { code: authError.code });
  const profileId = auth?.claims?.sub;
  const { error } = await supabase
    .from("applications")
    .insert(profileId ? { ...result.data, profile_id: profileId } : result.data);

  // No refresh(): /apply would re-render through ApplyGate ("under review" for a
  // signed-in applicant) and replace the success card that repeats the email.
  if (!error) return { status: "success" };
  // One open application per email and per account.
  if (error.code === "23505") return { status: "duplicate" };
  // Log only the code, never the submitted personal data (KVKK).
  console.error("submitApplication failed", { code: error.code });
  return { status: "error" };
}
