SET local check_function_bodies = off;

CREATE TABLE "public"."member_emergency_contacts" (
  "id"         uuid     NOT NULL DEFAULT gen_random_uuid(),
  "profile_id" uuid     NOT NULL,
  "position"   smallint NOT NULL,
  "name"       text     NOT NULL,
  CONSTRAINT "member_emergency_contacts_name_check" CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 80))),
  CONSTRAINT "member_emergency_contacts_pkey" PRIMARY KEY (id),
  CONSTRAINT "member_emergency_contacts_position_check" CHECK (("position" = ANY (ARRAY[1, 2]))),
  CONSTRAINT "member_emergency_contacts_position_key" UNIQUE (profile_id, "position")
);

ALTER TABLE "public"."member_emergency_contacts"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_emergency_contacts" FROM "anon";

CREATE TYPE "public"."emergency_relationship" AS ENUM (
  'spouse_partner',
  'parent',
  'sibling',
  'child',
  'friend',
  'other'
);

ALTER TABLE "public"."member_emergency_contacts"
  ADD COLUMN "relationship" public.emergency_relationship NOT NULL;

ALTER TABLE "public"."member_emergency_contacts"
  ADD COLUMN "phone" text NOT NULL;

ALTER TABLE "public"."member_emergency_contacts"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."member_emergency_contacts"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TYPE "public"."permission" ADD VALUE 'members.safety' AFTER 'members.manage';

