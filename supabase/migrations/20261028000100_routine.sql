create table if not exists public.routine_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  products jsonb not null default '[]'::jsonb,
  phases jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.routine_data enable row level security;

create policy "Members can manage their own routine data" on public.routine_data
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
