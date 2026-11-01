create table if not exists public.progress_catalog_products (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('skin', 'supplement')),
  name text not null check (char_length(name) between 1 and 160),
  brand text,
  photo_path text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.progress_products add column if not exists catalog_product_id uuid;

insert into public.progress_catalog_products (id, user_id, kind, name, brand, created_at)
select p.id, p.user_id, t.kind, p.name, p.brand, p.created_at
from public.progress_products p
join public.progress_tracks t on t.id = p.track_id and t.user_id = p.user_id
where p.catalog_product_id is null
on conflict (id) do nothing;

update public.progress_products
set catalog_product_id = id
where catalog_product_id is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'progress_products_catalog_fk') then
    alter table public.progress_products add constraint progress_products_catalog_fk
      foreign key (catalog_product_id, user_id) references public.progress_catalog_products(id, user_id) on delete restrict;
  end if;
end $$;

create index if not exists progress_catalog_products_user_idx on public.progress_catalog_products(user_id, kind, created_at desc);
alter table public.progress_catalog_products enable row level security;
create policy "Members can manage their progress product shelf" on public.progress_catalog_products
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
