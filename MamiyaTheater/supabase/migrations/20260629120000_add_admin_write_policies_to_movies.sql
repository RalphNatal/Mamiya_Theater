-- The movies table only had the public SELECT policy ("Movies are viewable
-- by everyone") — there was no write path at all, so the new admin Shows
-- manager (create/edit/delete movies) would fail with a row-level security
-- error. These three policies open that up, gated the same way every other
-- admin-write table in this app is gated: the calling user's OWN profiles
-- row must have role = 'admin'.

drop policy if exists "Admins can insert movies." on public.movies;
create policy "Admins can insert movies."
  on public.movies for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can update movies." on public.movies;
create policy "Admins can update movies."
  on public.movies for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can delete movies." on public.movies;
create policy "Admins can delete movies."
  on public.movies for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
