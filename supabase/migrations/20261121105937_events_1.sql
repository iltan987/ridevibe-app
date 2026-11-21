SET local check_function_bodies = off;

CREATE TABLE "public"."event_places" (
  "id"          uuid         NOT NULL DEFAULT gen_random_uuid(),
  "event_id"    uuid         NOT NULL,
  "position"    smallint     NOT NULL,
  "name"        text         NOT NULL,
  "lat"         numeric(9,6),
  "lng"         numeric(9,6),
  "venue_url"   text,
  "venue_label" text,
  CONSTRAINT "event_places_event_id_position_key" UNIQUE (event_id, "position"),
  CONSTRAINT "event_places_label_needs_venue" CHECK (((venue_label IS NULL) OR (venue_url IS NOT NULL))),
  CONSTRAINT "event_places_lat_check" CHECK (((lat >= ('-90'::integer)::numeric) AND (lat <= (90)::numeric))),
  CONSTRAINT "event_places_lng_check" CHECK (((lng >= ('-180'::integer)::numeric) AND (lng <= (180)::numeric))),
  CONSTRAINT "event_places_name_check" CHECK ((((char_length(name) >= 1) AND (char_length(name) <= 80)) AND (name = btrim(name)))),
  CONSTRAINT "event_places_pkey" PRIMARY KEY (id),
  CONSTRAINT "event_places_point_or_venue" CHECK (((lat IS NOT NULL) OR (venue_url IS NOT NULL))),
  CONSTRAINT "event_places_point_pair" CHECK (((lat IS NULL) = (lng IS NULL))),
  CONSTRAINT "event_places_position_check" CHECK ((("position" >= 0) AND ("position" <= 11))),
  CONSTRAINT "event_places_venue_label_check"
    CHECK (((venue_label IS NULL) OR (((char_length(venue_label) >= 1) AND (char_length(venue_label) <= 200)) AND (venue_label = btrim(venue_label))))),
  CONSTRAINT "event_places_venue_url_check"
    CHECK
    (((venue_url IS NULL) OR ((char_length(venue_url) <= 500) AND (venue_url ~ '^https://(www\.google\.com/maps/place/|yandex\.com\.tr/maps/org/)'::text) AND (venue_url !~
    '[?#[:space:]]'::text))))
);

ALTER TABLE "public"."event_places"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."event_places" FROM "anon";

CREATE TABLE "public"."events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT "events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."events" FROM "anon";

CREATE TYPE "public"."event_kind" AS ENUM (
  'meetup',
  'ride'
);

ALTER TABLE "public"."events"
  ADD COLUMN "kind" public.event_kind NOT NULL;

ALTER TABLE "public"."events"
  ADD COLUMN "title" text NOT NULL;

ALTER TABLE "public"."events"
  ADD COLUMN "side" public.istanbul_side;

ALTER TABLE "public"."events"
  ADD COLUMN "area" text;

ALTER TABLE "public"."events"
  ADD COLUMN "starts_at" timestamp WITH time zone NOT NULL;

ALTER TABLE "public"."events"
  ADD COLUMN "ends_at" timestamp WITH time zone;

ALTER TABLE "public"."events"
  ADD COLUMN "description" text;

ALTER TABLE "public"."events"
  ADD COLUMN "limit_people" integer;

ALTER TABLE "public"."events"
  ADD COLUMN "limit_bikes" integer;

ALTER TABLE "public"."events"
  ADD COLUMN "min_cc" integer;

ALTER TABLE "public"."events"
  ADD COLUMN "full_members_only" boolean NOT NULL DEFAULT false;

CREATE TYPE "public"."event_status" AS ENUM (
  'scheduled',
  'cancelled'
);

ALTER TABLE "public"."events"
  ADD COLUMN "status" public.event_status NOT NULL DEFAULT 'scheduled'::public.event_status;

ALTER TABLE "public"."events"
  ADD COLUMN "cancel_reason" text;

ALTER TABLE "public"."events"
  ADD COLUMN "cancelled_at" timestamp WITH time zone;

ALTER TABLE "public"."events"
  ADD COLUMN "created_by" uuid;

ALTER TABLE "public"."events"
  ADD COLUMN "updated_by" uuid;

ALTER TABLE "public"."events"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."events"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TYPE "public"."permission" ADD VALUE 'events.manage' AFTER 'members.notes';

