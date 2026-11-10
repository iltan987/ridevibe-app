ALTER TABLE "public"."applications"
  ADD COLUMN "conflict_handling" text;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_conflict_handling_check" CHECK (((char_length(conflict_handling) >= 3) AND (char_length(conflict_handling) <= 1000)));

REVOKE ALL ("conflict_handling") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("conflict_handling") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("conflict_handling") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("conflict_handling") ON TABLE "public"."applications" TO "authenticated";
