ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_event_interests_check"
    CHECK
    (((cardinality(event_interests) >= 1) AND (event_interests <@ ARRAY['day_rides'::text, 'multi_day_tours'::text, 'camping'::text, 'coffee_meetups'::text, 'training'::text,
    'off_road'::text, 'track_days'::text, 'maintenance'::text, 'charity_rides'::text, 'other'::text])));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_event_interests_check" CHECK ((char_length(other_event_interests) <= 300));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_events_named" CHECK (((NOT ('other'::text = ANY (event_interests))) OR (other_event_interests IS NOT NULL)));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_languages_check" CHECK ((char_length(other_languages) <= 120));

ALTER TABLE "public"."applications"
  ADD CONSTRAINT "applications_other_languages_named" CHECK (((NOT ('other'::text = ANY (languages))) OR (other_languages IS NOT NULL)));

REVOKE ALL ("other_event_interests") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("other_event_interests") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("other_languages") ON TABLE "public"."applications" FROM "anon";

GRANT INSERT ("other_languages") ON TABLE "public"."applications" TO "anon";

REVOKE ALL ("other_event_interests") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("other_event_interests") ON TABLE "public"."applications" TO "authenticated";

REVOKE ALL ("other_languages") ON TABLE "public"."applications" FROM "authenticated";

GRANT INSERT ("other_languages") ON TABLE "public"."applications" TO "authenticated";

