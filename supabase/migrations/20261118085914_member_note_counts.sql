SET local check_function_bodies = off;

CREATE VIEW "public"."member_note_counts" WITH (security_invoker=true) AS  SELECT profile_id,
    (count(*))::integer AS notes
   FROM public.member_notes
  GROUP BY profile_id;

REVOKE ALL ON TABLE "public"."member_note_counts" FROM "anon";

REVOKE ALL ON TABLE "public"."member_note_counts" FROM "authenticated";

GRANT SELECT ON TABLE "public"."member_note_counts" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_note_counts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_note_counts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_note_counts" TO "service_role";
