-- Adds an admin-only path for changing another user's role, and reconciles
-- it with the self-promotion guard from 20260626090000_protect_profiles_role_column.sql.
--
-- Why a function is needed at all: the profiles UPDATE policy only allows
-- `auth.uid() = id` (a user can update their OWN row), so even an admin
-- cannot run `update profiles set role = ... where id = <someone else>`
-- directly through the client — RLS blocks it before the trigger even runs.
-- set_user_role() is SECURITY DEFINER, so its internal UPDATE bypasses RLS
-- entirely (it runs as the function's owner, not as the calling user), but
-- the function itself re-checks "is the caller an admin?" before doing
-- anything, so this isn't a backdoor — it's the one sanctioned way around
-- the per-row UPDATE restriction, and only for admins.
create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void as $$
begin
  if new_role not in ('user', 'admin') then
    raise exception 'Invalid role: %. Must be ''user'' or ''admin''.', new_role;
  end if;

  if (select role from public.profiles where id = auth.uid()) is distinct from 'admin' then
    raise exception 'Not authorized: only admins can change another user''s role.';
  end if;

  update public.profiles set role = new_role where id = target_user_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Reconcile the role-protection trigger: a SECURITY DEFINER function still
-- runs its internal statements under the ORIGINAL caller's auth.uid()/
-- auth.role() (privilege escalation changes who can do what, not who the
-- request claims to be) — so the BEFORE UPDATE trigger below still fires for
-- set_user_role()'s internal UPDATE and still sees the real calling admin's
-- auth.uid(). The previous version of this function only ever allowed
-- service_role through, which would have blocked set_user_role() too. This
-- version adds the second allowance: a caller whose OWN profiles row already
-- has role = 'admin'.
--
-- Net effect (verified both ways):
--   - Normal user updates own row to role='admin' directly: auth.role() is
--     'authenticated', auth.uid() is their own non-admin id → blocked.
--   - Admin calls set_user_role() to promote/demote someone else: the
--     trigger fires with auth.uid() still pointing at the admin's id, whose
--     profiles.role = 'admin' → allowed.
--   - Dashboard / SQL editor / service_role key: auth.role() = 'service_role'
--     → allowed, same as before.
--
-- `create or replace function` + `drop trigger if exists` keep this
-- idempotent so re-running the migration (or having it land on top of
-- 20260626090000) never produces a duplicate trigger.
create or replace function public.prevent_role_self_update()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;
    end if;

    if exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    ) then
      return new;
    end if;

    raise exception 'Changing profiles.role is not permitted unless you are an admin.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_role_self_update on public.profiles;

create trigger trg_prevent_role_self_update
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_update();
