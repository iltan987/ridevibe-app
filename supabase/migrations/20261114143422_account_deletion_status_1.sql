ALTER TABLE "public"."applications"
  ADD COLUMN "retained_until" timestamp WITH time zone;

ALTER TABLE "public"."profiles"
  ADD COLUMN "deletion_requested_at" timestamp WITH time zone;

ALTER TYPE "public"."member_status" ADD VALUE 'deleting' AFTER 'inactive';

