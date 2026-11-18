SET local check_function_bodies = off;

ALTER TABLE "public"."profiles"
  ADD COLUMN "status_changed_at" timestamp WITH time zone;

ALTER TYPE "public"."member_status" ADD VALUE 'probation' BEFORE 'active';

