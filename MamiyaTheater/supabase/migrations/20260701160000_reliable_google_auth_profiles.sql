-- ─────────────────────────────────────────────────────────────────────────
-- RELIABLE PROFILE CREATION for Google (and email) auth
--
-- Root cause of the "Cannot coerce the result to a single JSON object" error:
-- a Google signup landed with NO profiles row, so a later .single() on
-- profiles found zero rows. This migration makes the auto-creation robust and
-- backfills any already-broken accounts.
--
--   1. handle_new_user() — never fails to create a profiles row: name falls
--      back full_name → name → email prefix; avatar falls back
--      avatar_url → picture → null; role 'user'; mobile_number left null
--      (Google never provides one). SECURITY DEFINER so it bypasses RLS, and
--      ON CONFLICT DO NOTHING so it's idempotent.
--   2. An INSERT policy so a signed-in user can self-heal their OWN row from
--      the client (the app upserts a minimal row if one is ever missing).
--   3. A one-time BACKFILL creating rows for existing auth.users missing one.
-- ─────────────────────────────────────────────────────────────────────────

-- 0. Defensive: the original mobile_number ALTER (20260625120000) was left
--    commented out, so ensure the column exists before the trigger writes it.
alter table public.profiles add column if not exists mobile_number text;

-- 1. Robust auto-creation trigger ──────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email, mobile_number, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)   -- email prefix fallback
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', ''),
      null
    ),
    new.email,
    new.raw_user_meta_data->>'mobile_number',        -- null for Google
    'user'
  )
  on conflict do nothing;   -- idempotent: ignores id (and email) collisions
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Let a user INSERT their own profile row (client-side self-heal) ─────────
--    The trigger (service definer) normally creates it; this policy only lets
--    a signed-in user recreate THEIR OWN missing row (WITH CHECK ties it to
--    auth.uid()). They still can't fabricate rows for anyone else, and the
--    existing role-protection trigger keeps them from self-promoting to admin.
drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile."
  on public.profiles for insert
  with check (auth.uid() = id);

-- 3. One-time BACKFILL — fix already-broken accounts ───────────────────────
--    Runs automatically on `supabase db push`. Idempotent (only inserts the
--    auth.users that have no profiles row), so it's safe to re-run in the SQL
--    editor too.
insert into public.profiles (id, full_name, avatar_url, email, mobile_number, role)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  coalesce(
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', ''),
    null
  ),
  u.email,
  u.raw_user_meta_data->>'mobile_number',
  'user'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict do nothing;

-- Refresh PostgREST so the column/policy changes are exposed immediately.
notify pgrst, 'reload schema';
