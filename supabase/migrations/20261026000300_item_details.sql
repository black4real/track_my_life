alter table public.items
  add column if not exists item_type text,
  add column if not exists specifications jsonb not null default '{}'::jsonb;

alter table public.events
  add column if not exists attributes jsonb not null default '{}'::jsonb;
