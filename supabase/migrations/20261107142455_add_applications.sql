SET local check_function_bodies = off;

CREATE TABLE "public"."applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT "applications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."applications"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."application_status" AS ENUM (
  'new',
  'contacted',
  'approved',
  'rejected'
);

ALTER TABLE "public"."applications"
  ADD COLUMN "status" public.application_status NOT NULL DEFAULT 'new'::public.application_status;

ALTER TABLE "public"."applications"
  ADD COLUMN "locale" text NOT NULL DEFAULT 'tr'::text;

ALTER TABLE "public"."applications"
  ADD COLUMN "full_name" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "phone" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "email" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "birth_date" date NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "city" text NOT NULL DEFAULT 'İstanbul'::text;

ALTER TABLE "public"."applications"
  ADD COLUMN "district" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "side" public.istanbul_side;

ALTER TABLE "public"."applications"
  ADD COLUMN "instagram" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "languages" text[] NOT NULL;

CREATE TYPE "public"."group_ride_experience" AS ENUM (
  'none',
  'some',
  'a_lot'
);

CREATE TYPE "public"."heard_from" AS ENUM (
  'instagram_ad',
  'instagram_other',
  'friend',
  'other'
);

CREATE TYPE "public"."license_class" AS ENUM (
  'a1',
  'a2',
  'a',
  'none'
);

ALTER TABLE "public"."applications"
  ADD COLUMN "license_class" public.license_class NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "riding_years" smallint NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "owns_motorcycle" boolean NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "motorcycle_brand" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "motorcycle_model" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "motorcycle_cc" smallint;

ALTER TABLE "public"."applications"
  ADD COLUMN "riding_styles" text[] NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "group_experience" public.group_ride_experience NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "in_other_clubs" boolean NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "other_club_names" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "heard_from" public.heard_from NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "referrer_name" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "event_interests" text[] NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "expectations" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "alienating_behaviors" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "consent_privacy" boolean NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "consent_rules" boolean NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "consent_photos" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."applications"
  ADD COLUMN "privacy_notice_version" text NOT NULL;

ALTER TABLE "public"."applications"
  ADD COLUMN "utm_source" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "utm_medium" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "utm_campaign" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "utm_content" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "utm_term" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "admin_notes" text;

ALTER TABLE "public"."applications"
  ADD COLUMN "reviewed_by" uuid;

ALTER TABLE "public"."applications"
  ADD COLUMN "reviewed_at" timestamp WITH time zone;

ALTER TABLE "public"."applications"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."applications"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION private.applications_before_insert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.email = lower(trim(new.email));
  if new.birth_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'applicant must be at least 18 years old'
      using errcode = '23514', constraint = 'applications_min_age';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.applications_track_review()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.status is distinct from old.status then
    new.reviewed_by = (select auth.uid());
    new.reviewed_at = now();
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_admin_notes_check" CHECK ((char_length(admin_notes) <= 4000));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_alienating_behaviors_check" CHECK (((char_length(alienating_behaviors) >= 3) AND (char_length(alienating_behaviors) <= 1000)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_birth_date_check" CHECK ((birth_date > '1920-01-01'::date));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_city_check" CHECK (((char_length(city) >= 1) AND (char_length(city) <= 80)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_consent_privacy_check" CHECK (consent_privacy);

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_consent_rules_check" CHECK (consent_rules);

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_district_check" CHECK (((char_length(district) >= 1) AND (char_length(district) <= 80)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_email_check" CHECK (((char_length(email) <= 254) AND (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_event_interests_check"
    CHECK
    (((cardinality(event_interests) >= 1) AND (event_interests <@ ARRAY['day_rides'::text, 'multi_day_tours'::text, 'camping'::text, 'coffee_meetups'::text, 'training'::text,
    'off_road'::text, 'track_days'::text, 'maintenance'::text, 'charity_rides'::text])));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_expectations_check" CHECK (((char_length(expectations) >= 10) AND (char_length(expectations) <= 1000)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_full_name_check" CHECK (((char_length(full_name) >= 2) AND (char_length(full_name) <= 120)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_instagram_check" CHECK ((instagram ~ '^[A-Za-z0-9._]{1,30}$'::text));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_languages_check" CHECK (((cardinality(languages) >= 1) AND (languages <@ ARRAY['tr'::text, 'en'::text, 'other'::text])));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_locale_check" CHECK ((locale = ANY (ARRAY['tr'::text, 'en'::text])));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_motorcycle_brand_check" CHECK ((char_length(motorcycle_brand) <= 60));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_motorcycle_cc_check" CHECK (((motorcycle_cc >= 50) AND (motorcycle_cc <= 3000)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_motorcycle_details" CHECK (((NOT owns_motorcycle) OR ((motorcycle_brand IS NOT NULL) AND (motorcycle_model IS NOT NULL))));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_motorcycle_model_check" CHECK ((char_length(motorcycle_model) <= 60));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_club_names_check" CHECK ((char_length(other_club_names) <= 300));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_clubs_named" CHECK (((NOT in_other_clubs) OR (other_club_names IS NOT NULL)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_phone_check" CHECK ((phone ~ '^\+[1-9][0-9]{6,14}$'::text));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_privacy_notice_version_check" CHECK ((char_length(privacy_notice_version) <= 40));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_referrer_name_check" CHECK ((char_length(referrer_name) <= 120));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_riding_styles_check"
    CHECK (((cardinality(riding_styles) >= 1) AND (riding_styles <@ ARRAY['city'::text, 'touring'::text, 'enduro'::text, 'sport'::text, 'cruiser'::text, 'scooter'::text])));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_riding_years_check" CHECK (((riding_years >= 0) AND (riding_years <= 70)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_utm_campaign_check" CHECK ((char_length(utm_campaign) <= 200));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_utm_content_check" CHECK ((char_length(utm_content) <= 200));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_utm_medium_check" CHECK ((char_length(utm_medium) <= 200));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_utm_source_check" CHECK ((char_length(utm_source) <= 200));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_utm_term_check" CHECK ((char_length(utm_term) <= 200));

CREATE UNIQUE INDEX applications_open_email_key ON public.applications USING btree (lower(email))
  WHERE (status = ANY (ARRAY['new'::public.application_status, 'contacted'::public.application_status]));

CREATE INDEX applications_status_created_idx ON public.applications USING btree (status, created_at DESC);

CREATE TRIGGER applications_before_insert
  BEFORE INSERT ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_before_insert();

CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER applications_track_review
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_track_review();

CREATE POLICY "applications: admins can delete" ON "public"."applications"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "applications: anyone can submit a new application" ON "public"."applications"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK ((status = 'new'::public.application_status));

CREATE POLICY "applications: staff can read" ON "public"."applications"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_staff() AS is_staff));

CREATE POLICY "applications: staff can review" ON "public"."applications"
  FOR UPDATE
  TO "authenticated"
  USING (( SELECT private.is_staff() AS is_staff))
  WITH CHECK (( SELECT private.is_staff() AS is_staff));

COMMENT ON TABLE "public"."applications" IS 'Membership applications from the public form.';

REVOKE ALL ON FUNCTION "private"."applications_before_insert"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."applications_track_review"() FROM PUBLIC;

REVOKE ALL ON TABLE "public"."applications" FROM "anon";

REVOKE ALL ("alienating_behaviors") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("alienating_behaviors") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("birth_date") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("birth_date") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("city") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("city") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("consent_photos") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("consent_photos") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("consent_privacy") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("consent_privacy") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("consent_rules") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("consent_rules") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("district") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("district") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("email") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("email") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("event_interests") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("event_interests") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("expectations") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("expectations") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("full_name") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("full_name") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("group_experience") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("group_experience") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("heard_from") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("heard_from") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("in_other_clubs") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("in_other_clubs") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("instagram") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("instagram") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("languages") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("languages") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("license_class") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("license_class") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("locale") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("locale") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("motorcycle_brand") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("motorcycle_brand") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("motorcycle_cc") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("motorcycle_cc") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("motorcycle_model") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("motorcycle_model") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("other_club_names") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("other_club_names") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("owns_motorcycle") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("owns_motorcycle") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("phone") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("phone") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("privacy_notice_version") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("privacy_notice_version") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("referrer_name") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("referrer_name") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("riding_styles") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("riding_styles") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("riding_years") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("riding_years") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("side") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("side") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("utm_campaign") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("utm_campaign") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("utm_content") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("utm_content") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("utm_medium") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("utm_medium") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("utm_source") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("utm_source") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("utm_term") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("utm_term") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ON TABLE "public"."applications" FROM "authenticated";

REVOKE ALL ("admin_notes") ON TABLE "public"."applications" FROM "authenticated";

GRANT UPDATE ("admin_notes") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("alienating_behaviors") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("alienating_behaviors") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("birth_date") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("birth_date") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("city") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("city") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("consent_photos") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("consent_photos") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("consent_privacy") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("consent_privacy") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("consent_rules") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("consent_rules") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("district") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("district") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("email") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("email") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("event_interests") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("event_interests") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("expectations") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("expectations") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("full_name") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("group_experience") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("group_experience") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("heard_from") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("heard_from") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("in_other_clubs") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("in_other_clubs") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("instagram") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("instagram") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("languages") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("languages") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("license_class") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("license_class") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("locale") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("locale") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("motorcycle_brand") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("motorcycle_brand") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("motorcycle_cc") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("motorcycle_cc") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("motorcycle_model") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("motorcycle_model") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("other_club_names") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("other_club_names") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("owns_motorcycle") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("owns_motorcycle") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("phone") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("privacy_notice_version") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("privacy_notice_version") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("referrer_name") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("referrer_name") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("riding_styles") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("riding_styles") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("riding_years") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("riding_years") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("side") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("side") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("status") ON TABLE "public"."applications" FROM "authenticated";

GRANT UPDATE ("status") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("utm_campaign") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("utm_campaign") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("utm_content") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("utm_content") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("utm_medium") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("utm_medium") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("utm_source") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("utm_source") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("utm_term") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("utm_term") ON TABLE "public"."applications" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ON TABLE "public"."applications" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."applications" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."applications" TO "service_role";
