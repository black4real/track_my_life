create table if not exists public.items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text,
  note text,
  product_url text,
  product_photo_path text,
  listed_price_override jsonb,
  current_product jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.variants (
  id uuid primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(12, 2),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$')
);

create table if not exists public.events (
  id uuid primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('purchase', 'service', 'use')),
  date date,
  amount numeric(12, 2),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  quantity integer check (quantity is null or quantity between 1 and 10000),
  variant text,
  note text,
  feeling text check (feeling is null or feeling in ('loved', 'okay', 'regret')),
  created_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists variants_item_id_idx on public.variants(item_id);
create index if not exists events_item_date_idx on public.events(item_id, date desc);

alter table public.items enable row level security;
alter table public.variants enable row level security;
alter table public.events enable row level security;

create policy "Members can manage their own items" on public.items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Members can manage variants on their items" on public.variants
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())));

create policy "Members can manage events on their items" on public.events
  for all to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can view their product photos" on storage.objects
  for select to authenticated using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members can upload their product photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members can update their product photos" on storage.objects
  for update to authenticated using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Members can delete their product photos" on storage.objects
  for delete to authenticated using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
