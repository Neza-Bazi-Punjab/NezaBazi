-- Any account may enter several riders on the online solo form.
--
-- The organisers register riders on behalf of families and clubs, and a
-- parent or coach with an ordinary account must be able to do the same
-- (decided 7 Nov 2026). Until now a dashboard-made trigger,
-- solo_one_per_player (function enforce_solo_one_per_player), refused a
-- second solo_registrations row for any profile that is not an
-- administrator with "You have already registered." (errcode 23505). This
-- migration removes it.
--
-- What still guards a double entry: the UNIQUE (email) and UNIQUE (phone)
-- constraints on solo_registrations (a later migration replaces them with a
-- same-name rule), and the site's own rule that a registration is the rider
-- while the account is whoever entered it (src/lib/registration-identity.ts):
-- account edits and photos reach only the holder's own entry.
--
-- The live project is migrated by hand (or through the Supabase connector),
-- so every statement is idempotent: a second run changes nothing.

drop trigger if exists solo_one_per_player on public.solo_registrations;
drop function if exists public.enforce_solo_one_per_player();

do $verify$
begin
  if exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = 'public.solo_registrations'::pg_catalog.regclass
      and tgname = 'solo_one_per_player'
  ) then
    raise exception 'solo_one_per_player is still on public.solo_registrations.';
  end if;

  if pg_catalog.to_regprocedure('public.enforce_solo_one_per_player()') is not null then
    raise exception 'enforce_solo_one_per_player() still exists.';
  end if;
end
$verify$;

notify pgrst, 'reload schema';
