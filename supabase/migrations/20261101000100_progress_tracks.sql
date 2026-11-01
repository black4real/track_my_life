create table if not exists public.progress_tracks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('skin', 'supplement')),
  name text not null check (char_length(name) between 1 and 120),
  areas text[] not null default '{}',
  started_on date,
  notes text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.progress_products (
  id uuid primary key,
  track_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  brand text,
  linked_item_id uuid references public.items(id) on delete set null,
  linked_routine_product_id text,
  dose text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (track_id, user_id) references public.progress_tracks(id, user_id) on delete cascade
);

create table if not exists public.progress_photos (
  id uuid primary key,
  track_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null,
  captured_on date not null,
  note text,
  period_days integer check (period_days is null or period_days between 0 and 10000),
  usage_counts jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (track_id, user_id) references public.progress_tracks(id, user_id) on delete cascade
);

create table if not exists public.progress_checkins (
  id uuid primary key,
  track_id uuid not null,
  product_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  used boolean not null,
  feeling text,
  note text,
  created_at timestamptz not null default now(),
  unique (product_id, checkin_date),
  foreign key (track_id, user_id) references public.progress_tracks(id, user_id) on delete cascade,
  foreign key (product_id, user_id) references public.progress_products(id, user_id) on delete cascade
);

create index if not exists progress_tracks_user_kind_idx on public.progress_tracks(user_id, kind, status);
create index if not exists progress_products_track_idx on public.progress_products(user_id, track_id);
create index if not exists progress_photos_track_date_idx on public.progress_photos(user_id, track_id, captured_on desc);
create index if not exists progress_checkins_product_date_idx on public.progress_checkins(user_id, product_id, checkin_date desc);

alter table public.progress_tracks enable row level security;
alter table public.progress_products enable row level security;
alter table public.progress_photos enable row level security;
alter table public.progress_checkins enable row level security;

create policy "Members can manage their progress tracks" on public.progress_tracks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members can manage products in their progress tracks" on public.progress_products
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members can manage photos in their progress tracks" on public.progress_photos
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Members can manage check-ins in their progress tracks" on public.progress_checkins
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
