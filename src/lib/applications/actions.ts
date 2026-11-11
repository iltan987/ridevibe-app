"use server";

import { getCurrentUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { type ApplicationFieldErrors, validateApplication } from "./schema";

export type SubmitApplicationResult =
  /** `linked`: submitted while signed in, so the application belongs to that account. */
  | { status: "success"; linked: boolean }
  | { status: "invalid"; fieldErrors: ApplicationFieldErrors }
  | { status: "duplicate" }
  | { status: "error" };

export async function submitApplication(formData: FormData): Promise<SubmitApplicationResult> {
  // Honeypot: invisible to people, bots fill it in. Pretend success.
  if (String(formData.get("website") ?? "") !== "") return { status: "success", linked: false };

  const result = validateApplication(formData);
  if (!result.ok) return { status: "invalid", fieldErrors: result.fieldErrors };

  // Insert as the visitor (anon or signed in); RLS + column grants allow only
  // applicant columns. No `.select()`: the public can't read applications.
  const supabase = await createClient();
  // Signed in: link the application to the account. The id comes from the
  // verified session, never from form data; RLS allows only the own id.
  // getCurrentUser() (not bare getClaims()) so a deleted account, whose token is
  // still valid, applies unlinked like the signed-out visitor it is shown as.
  const profileId = (await getCurrentUser())?.id;
  const { error } = await supabase
    .from("applications")
    .insert(profileId ? { ...result.data, profile_id: profileId } : result.data);

  // No refresh(): /apply would re-render through ApplyGate ("under review" for a
  // signed-in applicant) and replace the success card that repeats the email.
  if (!error) return { status: "success", linked: !!profileId };
  // One open application per email and per account.
  if (error.code === "23505") return { status: "duplicate" };
  // Log only the code, never the submitted personal data (KVKK).
  console.error("submitApplication failed", { code: error.code });
  return { status: "error" };
}
