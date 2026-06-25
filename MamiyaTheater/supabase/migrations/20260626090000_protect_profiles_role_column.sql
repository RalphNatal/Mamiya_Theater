-- Without a WITH CHECK clause, "Users can update their own profile." only
-- validated which row could be targeted (USING auth.uid() = id) — it never
-- validated the NEW row being written. Combined with the fact that `role`
-- was a perfectly ordinary, freely-updatable column, any logged-in user could
-- call:
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)
-- directly from the browser (devtools, curl, anything using the publishable
-- key + their own session) and grant themselves admin access, completely
-- bypassing every UI-level check (AdminLoginScreen, the App.tsx routing
-- guard, NavBar, etc.) — those only ever gate the *frontend*, never the API.
--
-- This migration closes both halves of that hole:
--   1) WITH CHECK (auth.uid() = id) on the self-update policy, so a user also
--      can't rewrite their row's `id` to someone else's and hijack a
--      different profile.
--   2) A BEFORE UPDATE trigger that rejects any attempt to change `role`
--      unless the request is NOT running as the shared `authenticated`
--      Postgres role — i.e. it blocks every normal logged-in user, while
--      still allowing the Supabase Table Editor / SQL Editor / service_role
--      key (none of which run as `authenticated`) to change roles.
--
-- Why a trigger instead of `revoke update (role) on public.profiles from
-- authenticated`: a column-level REVOKE would also work and is simpler, but
-- Supabase gives every logged-in user the SAME Postgres role (`authenticated`)
-- — RLS is what distinguishes "your row" from "someone else's", not separate
-- per-user grants. A hard REVOKE on that role is all-or-nothing: it would
-- permanently block updating `role` through the public API for *anyone*,
-- including a future admin-only in-app feature for promoting/demoting other
-- users. The trigger keeps that door open later (it can be extended to check
-- "is the calling user's own profiles.role = 'admin'" and allow it) while
-- still being just as strict today. Pick the REVOKE instead only if you're
-- certain role changes will always happen exclusively via the dashboard.

alter policy "Users can update their own profile."
  on public.profiles
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.prevent_role_self_update()
returns trigger as $$
begin
  if new.role is distinct from old.role and auth.role() = 'authenticated' then
    raise exception 'Changing profiles.role is not permitted through the API. Set it from the Supabase dashboard instead.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_role_self_update on public.profiles;

create trigger trg_prevent_role_self_update
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_update();
