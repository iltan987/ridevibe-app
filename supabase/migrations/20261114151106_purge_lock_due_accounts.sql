SET local check_function_bodies = off;

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

  -- (c) the accounts (cascades to profile and member rows)
  delete from auth.users u where u.id = any(due);

  -- (d) kept applications past their deadline
  delete from public.applications a
  where a.retained_until <= as_of;

  -- (e) job history keeps no more than 30 days
  delete from cron.job_run_details where end_time < as_of - interval '30 days';
end;
$function$;
