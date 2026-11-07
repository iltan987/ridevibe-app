ALTER TABLE "public"."applications"
  DROP CONSTRAINT "applications_event_interests_check";

ALTER TABLE "public"."applications"
  ADD COLUMN "other_languages" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "other_event_interests" text;

ALTER TYPE "public"."license_class" ADD VALUE 'b' BEFORE 'none';

