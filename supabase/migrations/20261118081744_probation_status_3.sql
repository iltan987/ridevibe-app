SET local check_function_bodies = off;

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

  -- A pending account first goes through ön alım.
  if target_status = 'pending' and new_status = 'active' then
    raise exception 'a pending account must go through probation first' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$function$;

CREATE TRIGGER profiles_stamp_status_change
  BEFORE UPDATE OF status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.profiles_stamp_status_change();

COMMENT ON COLUMN "public"."profiles"."status" IS 'pending = signed in but not yet approved; probation = ön alım, approved but not yet a full member (no member rights); active = club member; inactive = left or suspended; deleting = asked to delete the account (hidden, no rights, purged after 14 days).';

COMMENT ON COLUMN "public"."profiles"."status_changed_at" IS 'When the status last changed; moves into or out of deleting keep it. Null = before 2026-11-18.';

REVOKE ALL ON FUNCTION "private"."profiles_stamp_status_change"() FROM PUBLIC;

