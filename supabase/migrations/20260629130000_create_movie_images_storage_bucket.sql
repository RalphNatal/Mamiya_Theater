-- Storage bucket backing the poster/banner "Upload" controls in the admin
-- Shows manager. Unlike avatars (where each USER writes their own folder),
-- movie artwork is admin-managed: any signed-in visitor can read (posters
-- render on the public homepage and show detail pages), but only an admin
-- (profiles.role = 'admin') may write — there is no per-folder ownership
-- check here, just a role check, matching every other admin-write table.

insert into storage.buckets (id, name, public)
values ('movie-images', 'movie-images', true)
on conflict (id) do nothing;

drop policy if exists "Movie images are publicly readable." on storage.objects;
create policy "Movie images are publicly readable."
  on storage.objects for select
  using (bucket_id = 'movie-images');

drop policy if exists "Admins can upload movie images." on storage.objects;
create policy "Admins can upload movie images."
  on storage.objects for insert
  with check (
    bucket_id = 'movie-images'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can update movie images." on storage.objects;
create policy "Admins can update movie images."
  on storage.objects for update
  using (
    bucket_id = 'movie-images'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Admins can delete movie images." on storage.objects;
create policy "Admins can delete movie images."
  on storage.objects for delete
  using (
    bucket_id = 'movie-images'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
