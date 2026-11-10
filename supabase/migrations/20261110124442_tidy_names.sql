SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.applications_tidy_name()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.full_name = private.tidy_name(
    new.full_name, private.uses_turkish_casing(new.full_name, new.locale));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.profiles_tidy_name()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  new.full_name = private.tidy_name(
    new.full_name, private.uses_turkish_casing(new.full_name, new.preferred_locale));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.tidy_name (
  name    text,
  turkish boolean
)
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  words text[];
  parts text[];
  word text;
  part text;
  low text;
  upp text;
  letters int;
  result_words text[] := '{}';
  result_parts text[];
  w int := 0;
begin
  words := string_to_array(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'), ' ');
  foreach word in array words loop
    w := w + 1;
    -- Particles (de, van, von, …) stay lowercase unless they open the name.
    if w > 1 and word in ('de', 'da', 'di', 'du', 'van', 'von', 'der', 'den', 'la', 'le') then
      result_words := result_words || word;
      continue;
    end if;
    parts := string_to_array(word, '-');
    result_parts := '{}';
    foreach part in array parts loop
      if turkish then
        low := lower(translate(part, 'İI', 'iı'));
        upp := upper(translate(part, 'iı', 'İI'));
      else
        low := lower(translate(part, 'İ', 'I'));
        upp := upper(translate(part, 'İ', 'I'));
      end if;
      letters := char_length(regexp_replace(part, '[^[:alpha:]]', '', 'g'));
      if part = low and letters >= 1 then
        -- all lowercase: capitalise the first letter
        if turkish then
          part := upper(translate(left(part, 1), 'iı', 'İI')) || substr(part, 2);
        else
          part := upper(left(part, 1)) || substr(part, 2);
        end if;
      elsif part = upp and letters >= 2 then
        -- ALL CAPS: keep the first letter, lower the rest
        if turkish then
          part := left(part, 1) || lower(translate(substr(part, 2), 'İI', 'iı'));
        else
          part := left(part, 1) || lower(translate(substr(part, 2), 'İ', 'I'));
        end if;
      end if;
      result_parts := result_parts || part;
    end loop;
    result_words := result_words || array_to_string(result_parts, '-');
  end loop;
  return array_to_string(result_words, ' ');
end;
$function$;

CREATE OR REPLACE FUNCTION private.uses_turkish_casing (
  name   text,
  locale text
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select locale = 'tr' or name ~ '[ğĞıİşŞ]';
$function$;

CREATE TRIGGER applications_tidy_name
  BEFORE INSERT OR UPDATE OF full_name ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION private.applications_tidy_name();

CREATE TRIGGER profiles_tidy_name
  BEFORE INSERT OR UPDATE OF full_name ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.profiles_tidy_name();

REVOKE ALL ON FUNCTION "private"."applications_tidy_name"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."profiles_tidy_name"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."tidy_name"(text, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."uses_turkish_casing"(text, text) FROM PUBLIC;
