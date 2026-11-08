SET local check_function_bodies = off;

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
  return new;
end;
$function$;
