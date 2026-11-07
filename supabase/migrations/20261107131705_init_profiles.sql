SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "public"."profiles" (
  "id"               uuid NOT NULL,
  "full_name"        text NOT NULL DEFAULT ''::text,
  "avatar_url"       text,
  "preferred_locale" text NOT NULL DEFAULT 'tr'::text,
  CONSTRAINT "profiles_avatar_url_check" CHECK ((char_length(avatar_url) <= 2048)),
  CONSTRAINT "profiles_full_name_check" CHECK ((char_length(full_name) <= 120)),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_preferred_locale_check" CHECK ((preferred_locale = ANY (ARRAY['tr'::text, 'en'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."profiles" FROM "anon";

CREATE TYPE "public"."istanbul_side" AS ENUM (
  'asian',
  'european'
);

CREATE TYPE "public"."member_role" AS ENUM (
  'member',
  'organizer',
  'admin'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "role" public.member_role NOT NULL DEFAULT 'member'::public.member_role;

CREATE TYPE "public"."member_status" AS ENUM (
  'pending',
  'active',
  'inactive'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "status" public.member_status NOT NULL DEFAULT 'pending'::public.member_status;

ALTER TABLE "public"."profiles"
  ADD COLUMN "city" text NOT NULL DEFAULT 'İstanbul'::text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "district" text;

ALTER TABLE "public"."profiles"
  ADD COLUMN "side" public.istanbul_side;

ALTER TABLE "public"."profiles"
  ADD COLUMN "created_at" timestamp WITH time zone NOT NULL DEFAULT now();

ALTER TABLE "public"."profiles"
  ADD COLUMN "updated_at" timestamp WITH time zone NOT NULL DEFAULT now();

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
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.is_active_member()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select private.my_role() is not null;
$function$;

CREATE OR REPLACE FUNCTION private.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(private.my_role() = 'admin', false);
$function$;

CREATE OR REPLACE FUNCTION private.is_staff()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(private.my_role() in ('organizer', 'admin'), false);
$function$;

CREATE OR REPLACE FUNCTION private.my_role()
  RETURNS public.member_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active';
$function$;

CREATE OR REPLACE FUNCTION private.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_member_access (
  target_id  uuid,
  new_role   public.member_role,
  new_status public.member_status
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_admin() then
    raise exception 'only admins can change member access'
      using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) and (new_role <> 'admin' or new_status <> 'active') then
    raise exception 'admins cannot demote or deactivate themselves'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role, status = new_status
  where id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status) FROM PUBLIC, "anon";

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_city_check" CHECK (((char_length(city) >= 1) AND (char_length(city) <= 80)));

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_district_check" CHECK ((char_length(district) <= 80));

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX profiles_status_idx ON public.profiles USING btree (status);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "profiles: read own, active members, or all as staff" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING
    (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_staff() AS is_staff) OR ((status = 'active'::public.member_status) AND ( SELECT private.is_active_member() AS
    is_active_member))));

CREATE POLICY "profiles: update own" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

COMMENT ON COLUMN "public"."profiles"."status" IS 'pending = signed in but not yet approved; active = club member; inactive = left or suspended.';

COMMENT ON TABLE "public"."profiles" IS 'Club member profiles, one per auth user.';

REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_active_member"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_active_member"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_admin"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."is_staff"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_staff"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."my_role"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."my_role"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status) TO "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

REVOKE ALL ("avatar_url") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("avatar_url") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("city") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("city") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("district") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("district") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("full_name") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("preferred_locale") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("preferred_locale") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("side") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("side") ON TABLE "public"."profiles" TO "authenticated";

GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";
