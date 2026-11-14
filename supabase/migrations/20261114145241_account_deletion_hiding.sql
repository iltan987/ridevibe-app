SET local check_function_bodies = off;

DROP POLICY "applications: readable with applications.view" ON "public"."applications";

DROP POLICY "applications: reviewable with applications.review or decide" ON "public"."applications";

DROP POLICY "member_contacts: read own or with members.manage" ON "public"."member_contacts";

DROP POLICY "member_details: read own or with members.manage" ON "public"."member_details";

DROP POLICY "member_motorcycles: read own or with members.manage" ON "public"."member_motorcycles";

DROP POLICY "profiles: read own, active members, or all with members.manage" ON "public"."profiles";

CREATE OR REPLACE FUNCTION private.application_hidden_for_deletion (
  app_profile_id uuid,
  app_email      text,
  app_status     public.application_status
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select app_status <> 'rejected' and (
    case
      when app_profile_id is not null then
        exists (select 1 from public.profiles p where p.id = app_profile_id and p.status = 'deleting')
      else
        exists (
          select 1
          from public.profiles p
          join public.member_contacts c on c.profile_id = p.id
          where p.status = 'deleting'
            and private.normalize_email(c.email) = private.normalize_email(app_email)
        )
    end
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_member_name (
  target_id uuid,
  new_name  text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  clean_name text := btrim(new_name);
  target_is_admin boolean;
  target_status public.member_status;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) not between 2 and 120 then
    raise exception 'a name must be 2 to 120 characters' using errcode = '23514';
  end if;

  select coalesce(r.is_admin, false), p.status into target_is_admin, target_status
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_status = 'deleting' then
    raise exception 'the account is being deleted' using errcode = '42501';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can rename an admin' using errcode = '42501';
  end if;

  update public.profiles set full_name = clean_name where id = target_id;
end;
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

  -- An account being deleted is hidden from staff: treat it as untouchable.
  if exists (select 1 from public.profiles p where p.id = target_id and p.status = 'deleting') then
    raise exception 'the account is being deleted' using errcode = '42501';
  end if;

  update public.profiles set role_id = new_role_id where id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;
end;
$function$;

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
  target_status public.member_status;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;

  -- Deleting is the member's own decision (request_my_account_deletion), never staff's.
  if new_status = 'deleting' then
    raise exception 'staff cannot set the deleting status' using errcode = '42501';
  end if;

  select coalesce(r.is_admin, false), p.status into target_is_admin, target_status
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_status = 'deleting' then
    raise exception 'the account is being deleted' using errcode = '42501';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can change an admin''s status' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$function$;

CREATE POLICY "applications: readable with applications.view" ON "public"."applications"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT private.has_permission('applications.view'::public.permission) AS has_permission) AND (NOT private.application_hidden_for_deletion(profile_id, email, status))));

CREATE POLICY "applications: reviewable with applications.review or decide" ON "public"."applications"
  FOR UPDATE
  TO "authenticated"
  USING
    (((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)) AND (NOT private.application_hidden_for_deletion(profile_id, email, status))))
  WITH
    CHECK
    ((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)));

CREATE POLICY "member_contacts: read own or with members.manage" ON "public"."member_contacts"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.has_permission('members.manage'::public.permission) AS has_permission) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = member_contacts.profile_id) AND (p.status <> 'deleting'::public.member_status)))))));

CREATE POLICY "member_details: read own or with members.manage" ON "public"."member_details"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.has_permission('members.manage'::public.permission) AS has_permission) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = member_details.profile_id) AND (p.status <> 'deleting'::public.member_status)))))));

CREATE POLICY "member_motorcycles: read own or with members.manage" ON "public"."member_motorcycles"
  FOR SELECT
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.has_permission('members.manage'::public.permission) AS has_permission) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = member_motorcycles.profile_id) AND (p.status <> 'deleting'::public.member_status)))))));

CREATE POLICY "profiles: read own, active members, or all with members.manage" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING
    (((id = ( SELECT auth.uid() AS uid)) OR (( SELECT private.has_permission('members.manage'::public.permission) AS has_permission) AND (status <>
    'deleting'::public.member_status)) OR ((status = 'active'::public.member_status) AND ( SELECT private.is_active_member() AS is_active_member))));

REVOKE ALL ON FUNCTION "private"."application_hidden_for_deletion"(uuid, text, public.application_status) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."application_hidden_for_deletion"(uuid, text, public.application_status) TO "authenticated";
