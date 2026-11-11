SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.handle_google_avatar_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  url text := new.identity_data ->> 'avatar_url';
begin
  if url is not null and char_length(url) <= 2048 then
    update public.profiles set avatar_url = url where id = new.user_id and avatar_url is distinct from url;
  end if;
  return new;
end;
$function$;

CREATE TRIGGER on_google_identity_avatar_changed
  AFTER UPDATE OF identity_data ON auth.identities
  FOR EACH ROW
  WHEN (((new.provider = 'google'::text) AND ((old.identity_data ->> 'avatar_url'::text) IS DISTINCT FROM (new.identity_data ->> 'avatar_url'::text))))
  EXECUTE FUNCTION private.handle_google_avatar_change();

REVOKE ALL ON FUNCTION "private"."handle_google_avatar_change"() FROM PUBLIC, anon, authenticated;
