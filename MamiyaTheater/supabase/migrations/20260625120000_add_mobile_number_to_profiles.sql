alter table public.profiles add column mobile_number text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email, mobile_number, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    new.email,
    new.raw_user_meta_data->>'mobile_number',
    'user'
  );
  return new;
end;
$$ language plpgsql security definer;
