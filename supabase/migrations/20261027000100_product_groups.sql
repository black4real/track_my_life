alter table public.items
  add column if not exists brand text,
  add column if not exists related_group text;

alter table public.items
  add constraint items_brand_length check (brand is null or char_length(brand) <= 100),
  add constraint items_related_group_length check (related_group is null or char_length(related_group) <= 100);

create index if not exists items_user_related_group_idx
  on public.items(user_id, lower(related_group))
  where related_group is not null;
