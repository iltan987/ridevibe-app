-- ---------------------------------------------------------------------------
-- Name tidying: "kerim çelik" / "AYŞE NUR" -> "Kerim Çelik" / "Ayşe Nur".
-- Mixed-case parts (McLaren, DeLuca) are left alone. Turkish casing needs the
-- i-letters translated first: lower('İ') yields 'i' + combining dot, and
-- upper('i') is 'I' instead of 'İ' (docs/learnings/supabase.md).
-- ---------------------------------------------------------------------------

create or replace function private.uses_turkish_casing(name text, locale text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select locale = 'tr' or name ~ '[ğĞıİşŞ]';
$$;

create or replace function private.tidy_name(name text, turkish boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
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
$$;

revoke all on function private.uses_turkish_casing(text, text) from public, anon, authenticated;
revoke all on function private.tidy_name(text, boolean) from public, anon, authenticated;
