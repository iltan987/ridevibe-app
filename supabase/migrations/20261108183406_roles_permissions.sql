SET local check_function_bodies = off;

DROP POLICY "applications: admins can delete" ON "public"."applications";

DROP POLICY "applications: staff can read" ON "public"."applications";

DROP POLICY "applications: staff can review" ON "public"."applications";

DROP POLICY "profiles: read own, active members, or all as staff" ON "public"."profiles";

DROP INDEX "public"."profiles_status_idx";

DROP FUNCTION "private"."is_staff"();

DROP FUNCTION "private"."my_role"();

DROP FUNCTION "public"."admin_set_member_access"(uuid, public.member_role, public.member_status);

-- (profiles.role is dropped at the end, after its data is migrated to role_id.)

CREATE TABLE "public"."role_permissions" (
  "role_id" uuid NOT NULL
);

ALTER TABLE "public"."role_permissions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."role_permissions" FROM "anon";

CREATE TABLE "public"."roles" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "is_admin"   boolean                  NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "roles_name_check" CHECK (((char_length(TRIM(BOTH FROM name)) >= 1) AND (char_length(TRIM(BOTH FROM name)) <= 60))),
  CONSTRAINT "roles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."roles"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."roles" FROM "anon";

ALTER TABLE "public"."profiles"
  ADD COLUMN "role_id" uuid;

CREATE TYPE "public"."permission" AS ENUM (
  'applications.view',
  'applications.review',
  'applications.decide',
  'applications.delete',
  'members.manage'
);

ALTER TABLE "public"."role_permissions"
  ADD COLUMN "permission" public.permission NOT NULL;

CREATE OR REPLACE FUNCTION private.applications_check_decision()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user = 'authenticated'
    and new.status is distinct from old.status
    and (new.status in ('approved', 'rejected') or old.status in ('approved', 'rejected'))
    and not private.has_permission('applications.decide')
  then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.has_permission (
  required public.permission
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        r.is_admin
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission = required
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_active_member()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = (select auth.uid()) and p.status = 'active' and r.is_admin
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_member_role (
  target_id   uuid,
  new_role_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_admin() then
    raise exception 'only admins can assign roles' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;

  update public.profiles set role_id = new_role_id where id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_member_role"(uuid, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.set_member_status (
  target_id  uuid,
  new_status public.member_status
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  target_is_admin boolean;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;

  select coalesce(r.is_admin, false) into target_is_admin
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can change an admin''s status' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_member_status"(uuid, public.member_status) FROM PUBLIC, "anon";

ALTER TABLE "public"."role_permissions"
  ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE SET NULL;

ALTER TABLE "public"."role_permissions"
  ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

CREATE INDEX profiles_role_id_idx ON public.profiles USING btree (role_id);

CREATE INDEX profiles_status_created_idx ON public.profiles USING btree (status, created_at DESC, id DESC);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (lower(TRIM(BOTH FROM name)));

CREATE UNIQUE INDEX roles_single_admin_key ON public.roles USING btree (is_admin)
  WHERE is_admin;

CREATE TRIGGER applications_check_decision
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_check_decision();

CREATE TRIGGER roles_set_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "applications: deletable with applications.delete" ON "public"."applications"
  FOR DELETE
  TO "authenticated"
  USING (( SELECT private.has_permission('applications.delete'::public.permission) AS has_permission));

CREATE POLICY "applications: readable with applications.view" ON "public"."applications"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.has_permission('applications.view'::public.permission) AS has_permission));

CREATE POLICY "applications: reviewable with applications.review or decide" ON "public"."applications"
  FOR UPDATE
  TO "authenticated"
  USING
    ((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)))
  WITH
    CHECK
    ((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)));

CREATE POLICY "profiles: read own, active members, or all with members.manage" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING
    (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.has_permission('members.manage'::public.permission) AS has_permission) OR ((status = 'active'::public.member_status)
    AND ( SELECT private.is_active_member() AS is_active_member))));

CREATE POLICY "role_permissions: admins can grant on custom roles" ON "public"."role_permissions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT private.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_permissions.role_id) AND (NOT r.is_admin))))));

CREATE POLICY "role_permissions: admins can revoke on custom roles" ON "public"."role_permissions"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT private.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM public.roles r
  WHERE ((r.id = role_permissions.role_id) AND (NOT r.is_admin))))));

CREATE POLICY "role_permissions: signed-in users can read" ON "public"."role_permissions"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "roles: admins can create" ON "public"."roles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT private.is_admin() AS is_admin) AND (NOT is_admin)));

CREATE POLICY "roles: admins can delete custom roles" ON "public"."roles"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT private.is_admin() AS is_admin) AND (NOT is_admin)));

CREATE POLICY "roles: admins can rename custom roles" ON "public"."roles"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT private.is_admin() AS is_admin) AND (NOT is_admin)))
  WITH CHECK ((( SELECT private.is_admin() AS is_admin) AND (NOT is_admin)));

CREATE POLICY "roles: signed-in users can read" ON "public"."roles"
  FOR SELECT
  TO "authenticated"
  USING (true);

COMMENT ON TABLE "public"."role_permissions" IS 'Permissions of non-admin roles (the admin role has all implicitly).';

COMMENT ON TABLE "public"."roles" IS 'Staff roles. The single is_admin row is built in (created by migration).';

REVOKE ALL ON FUNCTION "private"."applications_check_decision"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."has_permission"(public.permission) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."has_permission"(public.permission) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."set_member_role"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_member_role"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_role"(uuid, uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_role"(uuid, uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_member_status"(uuid, public.member_status) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_member_status"(uuid, public.member_status) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_status"(uuid, public.member_status) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_member_status"(uuid, public.member_status) TO "service_role";

REVOKE ALL ON TABLE "public"."role_permissions" FROM "authenticated";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."role_permissions" TO "authenticated";

REVOKE ALL ON TABLE "public"."role_permissions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."role_permissions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."role_permissions" TO "service_role";

REVOKE ALL ON TABLE "public"."roles" FROM "authenticated";

REVOKE ALL ("name") ON TABLE "public"."roles" FROM "authenticated";

GRANT INSERT ("name"), UPDATE ("name") ON TABLE "public"."roles" TO "authenticated";

GRANT DELETE, SELECT ON TABLE "public"."roles" TO "authenticated";

REVOKE ALL ON TABLE "public"."roles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."roles" TO "service_role";

-- ---------------------------------------------------------------------------
-- Data migration (hand-written; declarative schemas don't track data).
-- Built-in admin role + an "Organizatör" role with today's organizer rights
-- minus approve/reject (admins can tick more in the UI). Then move each
-- profile's old enum role to role_id and drop the enum.
-- ---------------------------------------------------------------------------

INSERT INTO public.roles (name, is_admin) VALUES ('Yönetici', true), ('Organizatör', false);

INSERT INTO public.role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM public.roles r
CROSS JOIN (VALUES ('applications.view'::public.permission), ('applications.review'::public.permission)) AS p(permission)
WHERE r.name = 'Organizatör';

UPDATE public.profiles SET role_id = (SELECT id FROM public.roles WHERE is_admin) WHERE role = 'admin';
UPDATE public.profiles SET role_id = (SELECT id FROM public.roles WHERE name = 'Organizatör') WHERE role = 'organizer';

ALTER TABLE "public"."profiles"
  DROP COLUMN "role";

DROP TYPE "public"."member_role";
