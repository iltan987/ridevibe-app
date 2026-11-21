SET local check_function_bodies = off;

CREATE POLICY "event_places: organisers read (release gate)" ON "public"."event_places"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.has_permission('events.manage'::public.permission) AS has_permission));

CREATE POLICY "events: organisers read (release gate)" ON "public"."events"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.has_permission('events.manage'::public.permission) AS has_permission));

COMMENT ON TABLE "public"."event_places" IS 'Places of an event in route order. Replaced as a whole by save_event.';

COMMENT ON TABLE "public"."events" IS 'Meet-ups and rides. Written only via save_event / cancel_event / delete_event.';

REVOKE ALL ON FUNCTION "public"."cancel_event"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cancel_event"(uuid, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."cancel_event"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_event"(uuid, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_event"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_event"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."delete_event"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_event"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_event"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_event"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_event"(uuid, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_event"(uuid, jsonb, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."save_event"(uuid, jsonb, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_event"(uuid, jsonb, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_event"(uuid, jsonb, jsonb) TO "service_role";

REVOKE ALL ON TABLE "public"."event_places" FROM "authenticated";

GRANT SELECT ON TABLE "public"."event_places" TO "authenticated";

REVOKE ALL ON TABLE "public"."event_places" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_places" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."event_places" TO "service_role";

REVOKE ALL ON TABLE "public"."events" FROM "authenticated";

GRANT SELECT ON TABLE "public"."events" TO "authenticated";

REVOKE ALL ON TABLE "public"."events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events" TO "service_role";

