SET local check_function_bodies = off;

CREATE TABLE "public"."member_health" (
  "profile_id" uuid NOT NULL,
  CONSTRAINT "member_health_pkey" PRIMARY KEY (profile_id)
);

ALTER TABLE "public"."member_health"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_health" FROM "anon";

CREATE TABLE "public"."safety_access_log" (
  "id"        bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "actor_id"  uuid,
  "target_id" uuid,
  CONSTRAINT "safety_access_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."safety_access_log"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."safety_access_log" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."safety_access_log_id_seq" FROM "anon";

REVOKE ALL ON SEQUENCE "public"."safety_access_log_id_seq" FROM "authenticated";

CREATE TYPE "public"."blood_type" AS ENUM (
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  '0+',
  '0-'
);

ALTER TABLE "public"."member_health"
  ADD COLUMN "blood_type" public.blood_type;

ALTER TABLE "public"."member_health"
  ADD COLUMN "consent_blood_type" boolean NOT NULL;

ALTER TABLE "public"."member_health"
  ADD COLUMN "consent_blood_type_at" timestamp WITH time zone NOT NULL;

ALTER TABLE "public"."member_health"
  ADD COLUMN "consent_blood_type_version" text;

ALTER TABLE "public"."member_health"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE TYPE "public"."safety_action" AS ENUM (
  'view_card',
  'filter_blood_type',
  'set_blood_type',
  'withdraw_blood_type'
);

ALTER TABLE "public"."safety_access_log"
  ADD COLUMN "action" public.safety_action NOT NULL;

ALTER TABLE "public"."safety_access_log"
  ADD COLUMN "detail" text;

ALTER TABLE "public"."safety_access_log"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION private.log_safety_access (
  action public.safety_action,
  target uuid,
  detail text                 DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.safety_access_log (actor_id, target_id, action, detail)
  values ((select auth.uid()), target, action, detail);
$function$;

CREATE OR REPLACE FUNCTION public.set_my_blood_type (
  new_type       public.blood_type,
  notice_version text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  uid uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'only active members can set a blood type' using errcode = '42501';
  end if;
  if new_type is null then
    raise exception 'blood type is required' using errcode = '23514';
  end if;
  if char_length(notice_version) > 40 then
    raise exception 'notice version is too long' using errcode = '23514';
  end if;

  perform 1 from public.member_health h where h.profile_id = uid for update;

  insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values (uid, new_type, true, now(), notice_version)
  on conflict (profile_id) do update
    set blood_type = excluded.blood_type,
        consent_blood_type = true,
        consent_blood_type_at = excluded.consent_blood_type_at,
        consent_blood_type_version = excluded.consent_blood_type_version;

  perform private.log_safety_access('set_blood_type', uid);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_my_blood_type"(public.blood_type, text) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.withdraw_my_blood_type_consent()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  uid uuid := (select auth.uid());
begin
  perform 1 from public.member_health h where h.profile_id = uid and h.consent_blood_type for update;
  if not found then
    return;
  end if;

  update public.member_health
  set blood_type = null, consent_blood_type = false, consent_blood_type_at = now()
  where profile_id = uid;

  perform private.log_safety_access('withdraw_blood_type', uid);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."withdraw_my_blood_type_consent"() FROM PUBLIC, "anon";

ALTER TABLE "public"."member_health"
  ADD CONSTRAINT "member_health_consent_blood_type_version_check" CHECK ((char_length(consent_blood_type_version) <= 40));

ALTER TABLE "public"."member_health"
  ADD CONSTRAINT "member_health_consent" CHECK (((blood_type IS NULL) OR consent_blood_type));

ALTER TABLE "public"."member_health"
  ADD CONSTRAINT "member_health_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."safety_access_log"
  ADD CONSTRAINT "safety_access_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."safety_access_log"
  ADD CONSTRAINT "safety_access_log_detail_check" CHECK ((char_length(detail) <= 20));

ALTER TABLE "public"."safety_access_log"
  ADD CONSTRAINT "safety_access_log_target_id_fkey" FOREIGN KEY (target_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE TRIGGER member_health_set_updated_at
  BEFORE UPDATE ON public.member_health
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "member_health: read own" ON "public"."member_health"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "safety_access_log: admins read" ON "public"."safety_access_log"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_admin() AS is_admin));

COMMENT ON COLUMN "public"."member_health"."consent_blood_type_at" IS 'Time of the last give/withdraw of consent.';

COMMENT ON COLUMN "public"."member_health"."consent_blood_type_version" IS 'Privacy-notice version the member saw when giving consent.';

COMMENT ON TABLE "public"."member_health" IS 'Blood type of a member, only with explicit consent; written via set_my_blood_type / withdraw_my_blood_type_consent.';

COMMENT ON TABLE "public"."safety_access_log" IS 'Who read or wrote blood types or opened someone else''s safety card. detail never holds personal data beyond the filtered blood type.';

REVOKE ALL ON FUNCTION "private"."log_safety_access"(public.safety_action, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_my_blood_type"(public.blood_type, text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_my_blood_type"(public.blood_type, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_my_blood_type"(public.blood_type, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_my_blood_type"(public.blood_type, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."withdraw_my_blood_type_consent"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."withdraw_my_blood_type_consent"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."withdraw_my_blood_type_consent"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."withdraw_my_blood_type_consent"() TO "service_role";

REVOKE ALL ON SEQUENCE "public"."safety_access_log_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."safety_access_log_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."safety_access_log_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."safety_access_log_id_seq" TO "service_role";

REVOKE ALL ON TABLE "public"."member_health" FROM "authenticated";

GRANT SELECT ON TABLE "public"."member_health" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_health" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_health" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_health" TO "service_role";

REVOKE ALL ON TABLE "public"."safety_access_log" FROM "authenticated";

GRANT SELECT ON TABLE "public"."safety_access_log" TO "authenticated";

REVOKE ALL ON TABLE "public"."safety_access_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."safety_access_log" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."safety_access_log" TO "service_role";
