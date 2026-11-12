SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.applications_normalize_contact()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.email = lower(trim(new.email));
  if (TG_OP = 'INSERT' or new.phone is distinct from old.phone)
    and new.phone like '+90%'
    and not private.is_valid_phone(new.phone)
  then
    raise exception 'a Turkish phone number must be a mobile number (+905…)'
      using errcode = '23514', constraint = 'applications_tr_mobile';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_valid_phone (
  phone text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select phone ~ '^\+[1-9][0-9]{6,14}$'
    and (phone not like '+90%' or phone ~ '^\+905[0-9]{9}$');
$function$;

CREATE OR REPLACE FUNCTION private.member_emergency_contacts_check_phone()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_valid_phone(new.phone) then
    raise exception 'member_emergency_contacts_phone: invalid phone number'
      using errcode = '23514', constraint = 'member_emergency_contacts_phone';
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."member_emergency_contacts"
  ADD CONSTRAINT "member_emergency_contacts_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE TRIGGER member_emergency_contacts_phone
  BEFORE INSERT OR UPDATE OF phone ON public.member_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.member_emergency_contacts_check_phone();

CREATE TRIGGER member_emergency_contacts_set_updated_at
  BEFORE UPDATE ON public.member_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "member_emergency_contacts: delete own" ON "public"."member_emergency_contacts"
  FOR DELETE
  TO "authenticated"
  USING ((profile_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "member_emergency_contacts: insert own while active" ON "public"."member_emergency_contacts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)));

CREATE POLICY "member_emergency_contacts: read own" ON "public"."member_emergency_contacts"
  FOR SELECT
  TO "authenticated"
  USING ((profile_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "member_emergency_contacts: update own while active" ON "public"."member_emergency_contacts"
  FOR UPDATE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)))
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_active_member() AS is_active_member)));

COMMENT ON TABLE "public"."member_emergency_contacts" IS 'Emergency contacts of a member (position 1 and 2).';

REVOKE ALL ON FUNCTION "private"."is_valid_phone"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."member_emergency_contacts_check_phone"() FROM PUBLIC;

REVOKE ALL ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

REVOKE ALL ("name") ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

GRANT INSERT ("name"), UPDATE ("name") ON TABLE "public"."member_emergency_contacts" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

GRANT INSERT ("phone"), UPDATE ("phone") ON TABLE "public"."member_emergency_contacts" TO "authenticated";

REVOKE ALL ("position") ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

GRANT INSERT ("position") ON TABLE "public"."member_emergency_contacts" TO "authenticated";

REVOKE ALL ("profile_id") ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

GRANT INSERT ("profile_id") ON TABLE "public"."member_emergency_contacts" TO "authenticated";

REVOKE ALL ("relationship") ON TABLE "public"."member_emergency_contacts" FROM "authenticated";

GRANT INSERT ("relationship"), UPDATE ("relationship") ON TABLE "public"."member_emergency_contacts" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."member_emergency_contacts" TO "authenticated";

REVOKE ALL ON TABLE "public"."member_emergency_contacts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_emergency_contacts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."member_emergency_contacts" TO "service_role";

