alter table public.items
  add column if not exists archived_at timestamptz,
  add column if not exists consumable jsonb;

alter table public.events drop constraint if exists events_kind_check;
alter table public.events
  add constraint events_kind_check check (kind in ('purchase', 'service', 'use', 'opened', 'finished'));
