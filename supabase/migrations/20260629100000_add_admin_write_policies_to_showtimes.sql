-- The showtimes table only had the public SELECT policy ("Showtimes are
-- viewable by everyone") — there was no write path at all, so even an admin
-- signed in with the anon/publishable key could not insert, update, or
-- delete a showtime from the admin dashboard. These three policies open
-- that up, gated the same way the rest of the app gates admin actions:
-- the calling user's OWN profiles row must have role = 'admin'.
--
-- WITH CHECK on INSERT/UPDATE stops an admin from writing a row that
-- wouldn't itself satisfy the admin check (not meaningfully different here
-- since the check doesn't reference NEW's columns, but it's the correct
-- shape per Postgres RLS: USING gates which existing rows are visible to
-- the operation, WITH CHECK gates what the resulting row is allowed to be).

create policy "Admins can insert showtimes."
  on public.showtimes for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update showtimes."
  on public.showtimes for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins can delete showtimes."
  on public.showtimes for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
