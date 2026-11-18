SET local check_function_bodies = off;

CREATE TABLE "public"."member_notes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" uuid                     NOT NULL,
  "author_id"  uuid,
  "body"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_notes_body_check" CHECK ((((char_length(body) >= 1) AND (char_length(body) <= 2000)) AND (body = btrim(body)))),
  CONSTRAINT "member_notes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."member_notes"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_notes" FROM "anon";

ALTER TYPE "public"."permission" ADD VALUE 'members.notes' AFTER 'members.safety';

