SET local check_function_bodies = off;

ALTER TABLE "public"."applications"
  ADD COLUMN "riding_months" smallint;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_riding_months_check" CHECK (((riding_months >= 0) AND (riding_months <= 11)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_riding_months_under_a_year" CHECK (((riding_months IS NULL) OR (riding_years = 0)));

COMMENT ON COLUMN "public"."applications"."riding_months" IS 'Months riding when under a year (riding_years = 0); null otherwise and on rows before 2026-11-28.';

REVOKE ALL ("riding_months") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("riding_months") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("riding_months") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("riding_months") ON TABLE "public"."applications" TO "authenticated";
