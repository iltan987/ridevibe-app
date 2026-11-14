SET local check_function_bodies = off;

DROP POLICY "applications: reviewable with applications.review or decide" ON "public"."applications";

CREATE OR REPLACE FUNCTION private.purge_deleted_accounts (
  as_of timestamp with time zone DEFAULT now()
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  due uuid[];
begin
  select coalesce(array_agg(s.id), '{}') into due
  from (
    select p.id
    from public.profiles p
    where p.status = 'deleting'
      and p.deletion_requested_at <= as_of - interval '14 days'
    order by p.id
    for update
  ) s;

  -- (a) the approved application of a deleted inactive account (linked, or unlinked with its sign-in
  -- email) is kept for a year from the request, unlinked
  update public.applications a
  set retained_until = p.deletion_requested_at + interval '1 year',
      profile_id = null
  from public.profiles p
  where p.id = any(due)
    and p.status_before_deletion = 'inactive'
    and a.status = 'approved'
    and a.retained_until is null
    and (
      a.profile_id = p.id
      or (
        a.profile_id is null
        and exists (
          select 1
          from public.member_contacts c
          where c.profile_id = p.id
            and private.normalize_email(c.email) = private.normalize_email(a.email)
        )
      )
    );

  -- (b) every other application except rejected ones: linked to the account,
  -- or unlinked with the same sign-in email
  delete from public.applications a
  where a.status <> 'rejected'
    and a.retained_until is null
    and (
      a.profile_id = any(due)
      or (
        a.profile_id is null
        and exists (
          select 1
          from public.member_contacts c
          where c.profile_id = any(due)
            and private.normalize_email(c.email) = private.normalize_email(a.email)
        )
      )
    );

  -- (c) the people's Auth audit log rows (no FK to auth.users; payload holds actor_id + email, row has the IP)
  delete from auth.audit_log_entries e where e.payload->>'actor_id' = any(due::text[]);

  -- (d) the accounts (cascades to profile and member rows)
  delete from auth.users u where u.id = any(due);

  -- (e) kept applications past their deadline
  delete from public.applications a
  where a.retained_until <= as_of;

  -- (f) job history keeps no more than 30 days
  delete from cron.job_run_details where end_time < as_of - interval '30 days';
end;
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

  -- A deleting target is hidden from staff: same answer as an unknown id.
  if not found or target_status = 'deleting' then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
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

  -- An account being deleted is hidden from staff: answer exactly as for an unknown id.
  if exists (select 1 from public.profiles p where p.id = target_id and p.status = 'deleting') then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
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

  -- A deleting target is hidden from staff: same answer as an unknown id.
  if not found or target_status = 'deleting' then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can change an admin''s status' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$function$;

CREATE POLICY "applications: reviewable with applications.review or decide" ON "public"."applications"
  FOR UPDATE
  TO "authenticated"
  USING
    (((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)) AND (NOT private.application_hidden_for_deletion(profile_id, email, status))))
  WITH
    CHECK
    (((( SELECT private.has_permission('applications.review'::public.permission) AS has_permission) OR ( SELECT private.has_permission('applications.decide'::public.permission) AS
    has_permission)) AND (NOT private.application_hidden_for_deletion(profile_id, email, status))));
