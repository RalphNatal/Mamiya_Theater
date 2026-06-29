create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  showtime_id uuid references public.showtimes(id) on delete set null,
  movie_title text,
  show_start_time timestamptz,
  num_tickets int not null,
  total_price numeric not null,
  status text not null default 'confirmed',
  created_at timestamptz default now()
);

create table public.booking_seats (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  showtime_id uuid references public.showtimes(id) on delete cascade,
  seat_number text not null,
  unique (showtime_id, seat_number)
);

alter table public.bookings enable row level security;
alter table public.booking_seats enable row level security;

drop policy if exists "Users can view their own bookings." on public.bookings;
create policy "Users can view their own bookings."
  on public.bookings for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "Authenticated users can view booked seats." on public.booking_seats;
create policy "Authenticated users can view booked seats."
  on public.booking_seats for select
  using (auth.uid() is not null);

create or replace function public.create_booking(p_showtime_id uuid, p_seats text[])
returns uuid as $$
declare
  v_user_id uuid := auth.uid();
  v_price numeric;
  v_available_seats int;
  v_start_time timestamptz;
  v_movie_title text;
  v_num_tickets int;
  v_total numeric;
  v_booking_id uuid;
  v_seat text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_num_tickets := coalesce(array_length(p_seats, 1), 0);
  if v_num_tickets = 0 then
    raise exception 'Select at least one seat';
  end if;

  select s.price, coalesce(s.available_seats, 0), s.start_time, m.title
    into v_price, v_available_seats, v_start_time, v_movie_title
    from public.showtimes s
    left join public.movies m on m.id = s.movie_id
    where s.id = p_showtime_id
    for update of s;

  if not found then
    raise exception 'Showtime not found';
  end if;

  if v_num_tickets > v_available_seats then
    raise exception 'Not enough seats';
  end if;

  v_total := v_price * v_num_tickets;

  insert into public.bookings (
    user_id, showtime_id, movie_title, show_start_time, num_tickets, total_price, status
  ) values (
    v_user_id, p_showtime_id, v_movie_title, v_start_time, v_num_tickets, v_total, 'confirmed'
  )
  returning id into v_booking_id;

  begin
    foreach v_seat in array p_seats loop
      insert into public.booking_seats (booking_id, showtime_id, seat_number)
      values (v_booking_id, p_showtime_id, v_seat);
    end loop;
  exception when unique_violation then
    raise exception 'One or more selected seats are no longer available';
  end;

  update public.showtimes
    set available_seats = available_seats - v_num_tickets
    where id = p_showtime_id;

  return v_booking_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.create_booking(uuid, text[]) to authenticated;
