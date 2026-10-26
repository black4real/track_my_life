create table if not exists public.product_price_observations (
  id uuid primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source text not null check (source in ('flipkart-api', 'product-page', 'manual')),
  variant text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists product_price_observations_item_time_idx
  on public.product_price_observations(item_id, observed_at desc);

create index if not exists product_price_observations_user_idx
  on public.product_price_observations(user_id);

alter table public.product_price_observations enable row level security;

create policy "Members can manage their own product price observations" on public.product_price_observations
  for all to authenticated
  using (
    user_id = (select auth.uid()) and
    exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
  )
  with check (
    user_id = (select auth.uid()) and
    exists (select 1 from public.items i where i.id = item_id and i.user_id = (select auth.uid()))
  );
