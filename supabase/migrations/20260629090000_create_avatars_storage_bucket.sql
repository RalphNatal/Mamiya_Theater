-- Storage bucket backing the "Upload photo" control on the profile's
-- "Update details" form. Public-read because avatar URLs are rendered on
-- profile cards (a public-ish, low-sensitivity asset); write access is
-- restricted to each user's own folder (storage path `${auth.uid()}/...`)
-- so one logged-in user can't overwrite or replace another user's avatar
-- file even though they share the same bucket.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable." on storage.objects;
create policy "Avatar images are publicly readable."
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload to their own avatar folder." on storage.objects;
create policy "Users can upload to their own avatar folder."
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar folder." on storage.objects;
create policy "Users can update their own avatar folder."
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
