SET local check_function_bodies = off;

REVOKE ALL ("avatar_url") ON TABLE "public"."profiles" FROM "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."profiles" FROM "authenticated";

CREATE TABLE "public"."member_details" (
  "profile_id"             uuid                     NOT NULL,
  "birth_date"             date,
  "instagram"              text,
  "show_birthday"          boolean                  NOT NULL DEFAULT false,
  "show_instagram"         boolean                  NOT NULL DEFAULT false,
  "consent_photos"         boolean                  NOT NULL DEFAULT false,
  "consent_photos_at"      timestamp with time zone,
  "consent_photos_version" text,
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "member_details_consent_photos_version_check" CHECK ((char_length(consent_photos_version) <= 40)),
  CONSTRAINT "member_details_instagram_check" CHECK ((instagram ~ '^[A-Za-z0-9._]{1,30}$'::text)),
  CONSTRAINT "member_details_pkey" PRIMARY KEY (profile_id)
);

ALTER TABLE "public"."member_details"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."member_details" FROM "anon";

CREATE OR REPLACE FUNCTION private.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    -- Drop (don't truncate) an over-long picture URL: a failing CHECK here
    -- would abort the whole sign-up.
    case when char_length(new.raw_user_meta_data ->> 'avatar_url') <= 2048
      then new.raw_user_meta_data ->> 'avatar_url' end
  );
  insert into public.member_contacts (profile_id, email) values (new.id, new.email);
  insert into public.member_details (profile_id) values (new.id);
  perform private.activate_from_approved_application(new.id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.member_details_stamp_consent()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.consent_photos is distinct from old.consent_photos
     and new.consent_photos_at is not distinct from old.consent_photos_at then
    new.consent_photos_at = now();
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."member_details"
  ADD CONSTRAINT "member_details_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TRIGGER member_details_set_updated_at
  BEFORE UPDATE ON public.member_details
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER member_details_stamp_consent
  BEFORE UPDATE ON public.member_details
  FOR EACH ROW
  EXECUTE FUNCTION private.member_details_stamp_consent();

CREATE POLICY "member_details: read own or with members.manage" ON "public"."member_details"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_permission('members.manage'::public.permission) AS has_permission)));

CREATE POLICY "member_details: update own" ON "public"."member_details"
  FOR UPDATE
  TO "authenticated"
  USING ((profile_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((profile_id = ( SELECT auth.uid() AS uid)));

COMMENT ON COLUMN "public"."member_details"."birth_date" IS 'Copied from the approved application; read-only for the member.';

COMMENT ON COLUMN "public"."member_details"."consent_photos_at" IS 'Stamped by trigger when consent_photos changes (or copied from an application); null = never decided.';

COMMENT ON COLUMN "public"."member_details"."consent_photos_version" IS 'Privacy-notice version the member saw when deciding; written by the app with the consent.';

COMMENT ON TABLE "public"."member_details" IS 'Private member data: birth date, Instagram, directory visibility switches, photo consent.';

REVOKE ALL ON FUNCTION "private"."member_details_stamp_consent"() FROM PUBLIC;

REVOKE ALL ON TABLE "public"."member_details" FROM "authenticated";

REVOKE ALL ("consent_photos_version") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("consent_photos_version") ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ("consent_photos") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("consent_photos") ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ("instagram") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("instagram") ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ("show_birthday") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("show_birthday") ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ("show_instagram") ON TABLE "public"."member_details" FROM "authenticated";

GRANT UPDATE ("show_instagram") ON TABLE "public"."member_details" TO "authenticated";

GRANT SELECT ON TABLE "public"."member_details" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_details" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_details" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_details" TO "service_role";
