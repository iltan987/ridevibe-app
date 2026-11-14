SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.request_my_account_deletion()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  me uuid := (select auth.uid());
  current_status public.member_status;
  is_active_admin boolean;
  requested timestamptz;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Unlocked peek: is the caller an active admin? Admins take the ordered lock on every active admin
  -- (own row included) before anything else, so two admins requesting at once cannot deadlock
  -- (40P01). A role change between this peek and the lock is harmless: a stale answer at worst
  -- locks too much, or skips the last-admin check for a caller who became an admin a moment ago.
  select coalesce(r.is_admin, false) and p.status = 'active' into is_active_admin
  from public.profiles p left join public.roles r on r.id = p.role_id
  where p.id = me;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if is_active_admin then
    perform 1 from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_admin and p.status = 'active'
    order by p.id
    for update of p;
  end if;

  select p.status into current_status from public.profiles p where p.id = me for update;
  if current_status = 'deleting' then
    raise exception 'account deletion is already requested' using errcode = '55000';
  end if;

  if is_active_admin and current_status = 'active' and not exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_admin and p.status = 'active' and p.id <> me
  ) then
    raise exception 'you are the only active admin' using errcode = '42501', hint = 'last_admin';
  end if;

  update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = current_status
  where id = me
  returning deletion_requested_at into requested;

  return requested + interval '14 days';
end;
$function$;
